import { test } from '@japa/runner'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  resolveReadableSource,
  summarizePathAvailability,
} from '../../app/services/library_availability_service.js'

test.group('library availability', () => {
  test('distinguishes a missing root, scan folder and source, and reads a restored source', async ({
    assert,
  }) => {
    const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'smanga-availability-'))
    const rootPath = path.join(fixture, 'mount')
    const record = {
      storageRootId: 1,
      pathContent: 'manga',
      deleteFlag: 0,
      storageRoot: { storageRootId: 1, enabled: 1, deleteFlag: 0, rootPath, rootName: '测试网盘' },
    }
    const relative = 'manga/Comic/01'
    try {
      const offline = await resolveReadableSource(record, relative, '章节')
      assert.equal(offline.availability.code, 'STORAGE_ROOT_UNAVAILABLE')
      assert.include(offline.availability.message, '测试网盘')
      assert.notInclude(offline.availability.message, fixture)
      await fs.mkdir(rootPath)
      const noScan = await resolveReadableSource(record, relative, '章节')
      assert.equal(noScan.availability.code, 'SCAN_PATH_UNAVAILABLE')
      await fs.mkdir(path.join(rootPath, 'manga'))
      const noSource = await resolveReadableSource(record, relative, '章节')
      assert.equal(noSource.availability.code, 'SOURCE_MISSING')
      await fs.mkdir(path.join(rootPath, relative), { recursive: true })
      const restored = await resolveReadableSource(record, relative, '章节')
      assert.equal(restored.path, path.join(rootPath, relative))
      assert.equal(restored.availability.status, 'available')
      record.storageRoot.enabled = 0
      const disabled = await resolveReadableSource(record, relative, '章节')
      assert.equal(disabled.availability.code, 'STORAGE_ROOT_DISABLED')
    } finally {
      await fs.rm(fixture, { recursive: true, force: true })
    }
  })

  test('reports full outage only when every path is confirmed unavailable', ({ assert }) => {
    const failed = {
      status: 'unavailable',
      code: 'STORAGE_ROOT_UNAVAILABLE',
      message: 'offline',
    } as const
    const unknown = { status: 'unknown', code: 'CHECK_TIMEOUT', message: 'timeout' } as const
    const ready = { status: 'available', code: 'AVAILABLE', message: '' } as const
    assert.deepEqual(summarizePathAvailability([failed, ready]), {
      status: 'partial',
      unavailablePaths: 1,
      unknownPaths: 0,
    })
    assert.equal(summarizePathAvailability([failed, unknown]).status, 'partial')
    assert.equal(summarizePathAvailability([failed, null]).status, 'partial')
    assert.equal(summarizePathAvailability([failed, failed]).status, 'unavailable')
    assert.equal(summarizePathAvailability([unknown]).status, 'unknown')
    assert.equal(summarizePathAvailability([null]).status, 'unmonitored')
  })
})
