import { test } from '@japa/runner'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  LibraryPathContext,
  normalizeRelativeLibraryPath,
} from '../../app/services/library_path_service.js'

function context(rootPath: string, enabled = 1) {
  return new LibraryPathContext({
    storageRootId: 1,
    storageRoot: { storageRootId: 1, rootPath, enabled, deleteFlag: 0 },
  })
}

test.group('library storage roots', () => {
  test('reuses the stored manga, chapter, and metadata paths after a mount moves', ({ assert }) => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'smanga-storage-root-'))
    const oldRoot = path.join(fixture, 'original')
    const newRoot = path.join(fixture, '飞牛挂载')
    const manga = path.join(oldRoot, 'manga', '漫画')
    const chapter = path.join(manga, '第 01 话', '001.jpg')
    const metadata = path.join(manga, '.smanga', 'cover.jpg')
    fs.mkdirSync(path.dirname(chapter), { recursive: true })
    fs.mkdirSync(path.dirname(metadata), { recursive: true })
    fs.writeFileSync(chapter, 'page')
    fs.writeFileSync(metadata, 'cover')

    try {
      const original = context(oldRoot)
      assert.equal(original.toStored(manga), 'manga/漫画')
      const storedChapter = original.toStored(chapter)
      const storedMeta = original.toStoredDataPath(metadata)
      const externalCache = path.join(fixture, 'cache.jpg')
      assert.equal(original.toStoredDataPath(externalCache), externalCache)

      fs.renameSync(oldRoot, newRoot)
      assert.throws(() => original.scanDirectory('manga'), /无法访问/)
      const moved = context(newRoot)
      assert.equal(moved.scanDirectory('manga'), path.join(newRoot, 'manga'))
      assert.equal(fs.readFileSync(moved.resolve(storedChapter), 'utf8'), 'page')
      assert.equal(fs.readFileSync(moved.resolveDataPath(storedMeta), 'utf8'), 'cover')
      assert.equal(moved.resolveDataPath(externalCache), externalCache)
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true })
    }
  })

  test('keeps old absolute paths and rejects invalid root-relative paths', ({ assert }) => {
    const legacyPath = path.resolve('old-library')
    const legacy = new LibraryPathContext()
    assert.equal(legacy.resolve(legacyPath), legacyPath)
    assert.equal(legacy.toStored(legacyPath), legacyPath)
    assert.equal(normalizeRelativeLibraryPath('漫画\\分类'), '漫画/分类')
    assert.throws(() => normalizeRelativeLibraryPath('../other'), /不能超出/)
    assert.throws(() => normalizeRelativeLibraryPath('manga/../other'), /不能超出/)
    assert.throws(() => normalizeRelativeLibraryPath('C:other'), /相对路径/)
    assert.throws(() => normalizeRelativeLibraryPath('/other'), /相对路径/)
    assert.throws(() => context(legacyPath, 0), /已停用/)
    const filesystemRoot = path.parse(legacyPath).root
    assert.equal(context(filesystemRoot).resolve('old-library'), path.join(filesystemRoot, 'old-library'))
  })
})
