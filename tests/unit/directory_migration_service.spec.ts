import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from '@japa/runner'
import {
  checkDirectoryMigrationPaths,
  copyMigrationDirectory,
  createMigrationTarget,
  finishDirectoryMigration,
  planDirectoryCopies,
} from '#services/directory_migration_service'
import { queueJobData } from '#services/queue/sql_queue_repository'

test.group('directory migration', () => {
  test('stores a timeout supported by the SQL Int column and the worker timer', ({ assert }) => {
    const job = queueJobData({
      taskQueue: 'sync',
      taskName: 'directory_migration_test',
      command: 'taskDirectoryMigration',
      args: {},
      timeout: 30 * 24 * 60 * 60 * 1000,
    })

    assert.equal(job.timeout_ms, 2_147_483_647)
  })

  test('copies missing files and skips existing files', async ({ assert }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smanga-directory-migration-'))
    try {
      const source = path.join(root, 'source')
      const target = path.join(root, 'target')
      await fs.mkdir(path.join(source, 'comic'), { recursive: true })
      await fs.mkdir(path.join(target, 'comic'), { recursive: true })
      await fs.writeFile(path.join(source, 'comic', '001.jpg'), 'source-001')
      await fs.writeFile(path.join(source, 'comic', '002.jpg'), 'source-002')
      await fs.writeFile(path.join(target, 'comic', '001.jpg'), 'existing-target')

      const stats = await copyMigrationDirectory({
        sourcePath: source, targetPath: target, relativePath: 'comic', runId: randomUUID(),
      })

      assert.equal(await fs.readFile(path.join(target, 'comic', '001.jpg'), 'utf8'), 'existing-target')
      assert.equal(await fs.readFile(path.join(target, 'comic', '002.jpg'), 'utf8'), 'source-002')
      assert.equal(await fs.readFile(path.join(source, 'comic', '002.jpg'), 'utf8'), 'source-002')
      assert.equal(stats.copiedFiles, 1)
      assert.equal(stats.skippedFiles, 1)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  test('creates missing target directories and leaves existing files intact', async ({ assert }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smanga-create-migration-target-'))
    try {
      const target = path.join(root, 'missing', 'comics')
      const created = await createMigrationTarget(target)
      assert.isTrue(created.available)
      assert.include(created.message, '已创建')
      assert.isTrue((await fs.stat(target)).isDirectory())

      const existing = await createMigrationTarget(target)
      assert.isTrue(existing.available)
      assert.include(existing.message, '已存在')

      const file = path.join(root, 'existing.cbz')
      await fs.writeFile(file, 'preserve')
      assert.isFalse((await createMigrationTarget(file)).available)
      assert.equal(await fs.readFile(file, 'utf8'), 'preserve')
      assert.isFalse((await createMigrationTarget('relative-target')).available)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  test('plans every nested directory and reclaims only this run’s partial files', async ({ assert }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smanga-directory-copy-'))
    try {
      const sourcePath = path.join(root, 'source')
      const targetPath = path.join(root, 'target')
      const chapter = path.join('category', 'comic', 'chapter')
      await fs.mkdir(path.join(sourcePath, chapter, 'empty'), { recursive: true })
      await fs.mkdir(path.join(targetPath, chapter), { recursive: true })
      await fs.writeFile(path.join(sourcePath, 'cover.jpg'), 'root cover')
      await fs.writeFile(path.join(sourcePath, chapter, '001.jpg'), 'complete')
      const runId = randomUUID()
      const partial = `.smanga-${runId}-${randomUUID()}.partial`
      const unrelatedPartial = `.smanga-${randomUUID()}-${randomUUID()}.partial`
      await fs.writeFile(path.join(targetPath, chapter, partial), 'part')
      await fs.writeFile(path.join(targetPath, chapter, unrelatedPartial), 'other run')

      assert.deepEqual(await planDirectoryCopies(sourcePath), [
        '', 'category', path.join('category', 'comic'), chapter, path.join(chapter, 'empty'),
      ])
      await copyMigrationDirectory({ sourcePath, targetPath, relativePath: '', runId })
      await assert.rejects(() => fs.stat(path.join(targetPath, chapter, '001.jpg')))
      await copyMigrationDirectory({ sourcePath, targetPath, relativePath: chapter, runId }, true)
      assert.sameMembers(await fs.readdir(path.join(targetPath, chapter)), ['001.jpg', unrelatedPartial])
      assert.equal(await fs.readFile(path.join(targetPath, chapter, '001.jpg'), 'utf8'), 'complete')
      await copyMigrationDirectory({ sourcePath, targetPath, relativePath: path.join(chapter, 'empty'), runId })
      assert.isTrue((await fs.stat(path.join(targetPath, chapter, 'empty'))).isDirectory())
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  test('preserves a different same-name source and resumes cleanup without repeating mirror deletion', async ({ assert }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smanga-directory-move-'))
    try {
      const source = path.join(root, 'source')
      const target = path.join(root, 'target')
      await fs.mkdir(path.join(source, 'comic'), { recursive: true })
      await fs.mkdir(target)
      await fs.writeFile(path.join(source, 'comic', 'new.cbz'), 'copied')
      await fs.writeFile(path.join(source, 'match.cbz'), 'same')
      await fs.writeFile(path.join(target, 'match.cbz'), 'same')
      await fs.writeFile(path.join(source, 'conflict.cbz'), 'from')
      await fs.writeFile(path.join(target, 'conflict.cbz'), 'diff')
      await fs.writeFile(path.join(target, 'obsolete.cbz'), 'remove')

      const input = { sourcePath: source, targetPath: target, mirrorDelete: true, deleteSource: true }
      const checkpoint = { started: false, save: async () => { checkpoint.started = true } }
      const runId = randomUUID()
      for (const relativePath of await planDirectoryCopies(source)) {
        await copyMigrationDirectory({ ...input, relativePath, runId })
      }

      await assert.rejects(() => finishDirectoryMigration(input, checkpoint), /已保留未验证的源文件/)
      assert.isTrue(checkpoint.started)
      await assert.rejects(() => fs.stat(path.join(source, 'comic', 'new.cbz')))
      await assert.rejects(() => fs.stat(path.join(source, 'match.cbz')))
      await assert.rejects(() => fs.stat(path.join(target, 'obsolete.cbz')))
      assert.equal(await fs.readFile(path.join(source, 'conflict.cbz'), 'utf8'), 'from')
      assert.equal(await fs.readFile(path.join(target, 'conflict.cbz'), 'utf8'), 'diff')

      await fs.writeFile(path.join(target, 'conflict.cbz'), 'from')
      const stats = await finishDirectoryMigration(input, checkpoint)
      assert.equal(stats.deletedSourceFiles, 1)
      assert.deepEqual(await fs.readdir(path.join(source, 'comic')), [])
      await assert.rejects(() => fs.stat(path.join(source, 'conflict.cbz')))
      assert.equal(await fs.readFile(path.join(target, 'comic', 'new.cbz'), 'utf8'), 'copied')
      assert.equal(await fs.readFile(path.join(target, 'match.cbz'), 'utf8'), 'same')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  test('mirror mode removes entries missing from source', async ({ assert }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smanga-directory-mirror-'))
    try {
      const source = path.join(root, 'source')
      const target = path.join(root, 'target')
      await fs.mkdir(source)
      await fs.mkdir(path.join(target, 'removed-dir'), { recursive: true })
      await fs.writeFile(path.join(source, 'keep.cbz'), 'keep')
      await fs.writeFile(path.join(target, 'keep.cbz'), 'existing')
      await fs.writeFile(path.join(target, 'removed.cbz'), 'remove')
      await fs.writeFile(path.join(target, 'removed-dir', 'page.jpg'), 'remove')

      const stats = await finishDirectoryMigration(
        { sourcePath: source, targetPath: target, mirrorDelete: true },
        { started: false, save: async () => {} }
      )

      assert.equal(await fs.readFile(path.join(target, 'keep.cbz'), 'utf8'), 'existing')
      await assert.rejects(() => fs.stat(path.join(target, 'removed.cbz')))
      await assert.rejects(() => fs.stat(path.join(target, 'removed-dir')))
      assert.equal(stats.deletedFiles, 1)
      assert.equal(stats.deletedDirectories, 1)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  test('rejects overlapping directories', async ({ assert }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smanga-directory-overlap-'))
    try {
      const nested = path.join(root, 'nested')
      await fs.mkdir(nested)
      const result = await checkDirectoryMigrationPaths({ sourcePath: root, targetPath: nested })
      assert.isFalse(result.available)
      assert.include(result.message, '不能互相包含')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
