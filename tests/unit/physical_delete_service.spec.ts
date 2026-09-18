import { test } from '@japa/runner'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  deleteFileRequested,
  deletePhysicalTarget,
  resolvePhysicalDeleteTarget,
} from '../../app/services/physical_delete_service.js'

test.group('physical delete service', () => {
  test('parses explicit delete-file values only', ({ assert }) => {
    assert.isTrue(deleteFileRequested(true))
    assert.isTrue(deleteFileRequested(1))
    assert.isTrue(deleteFileRequested('true'))
    assert.isTrue(deleteFileRequested('1'))
    assert.isFalse(deleteFileRequested(false))
    assert.isFalse(deleteFileRequested('false'))
    assert.isFalse(deleteFileRequested(undefined))
  })

  test('deletes a target inside the configured media root', ({ assert }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smanga-delete-'))
    const target = path.join(root, 'manga')
    fs.mkdirSync(target)
    fs.writeFileSync(path.join(target, '001.jpg'), 'test')

    deletePhysicalTarget(target, root)

    assert.isFalse(fs.existsSync(target))
    assert.isTrue(fs.existsSync(root))
    fs.rmSync(root, { recursive: true, force: true })
  })

  test('rejects targets outside the configured media root', ({ assert }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smanga-delete-root-'))
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'smanga-delete-outside-'))

    assert.throws(() => resolvePhysicalDeleteTarget(outside, root), /不在允许删除的媒体库范围内/)

    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })

  test('requires explicit permission to delete a configured media root', ({ assert }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smanga-delete-root-'))

    assert.throws(() => resolvePhysicalDeleteTarget(root, root), /不在允许删除的媒体库范围内/)
    assert.equal(resolvePhysicalDeleteTarget(root, root, { allowRoot: true }), root)

    fs.rmSync(root, { recursive: true, force: true })
  })

  test('rejects a target reached through a symlink outside the media root', ({ assert }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smanga-delete-root-'))
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'smanga-delete-outside-'))
    const outsideTarget = path.join(outside, 'manga')
    fs.mkdirSync(outsideTarget)
    fs.symlinkSync(outside, path.join(root, 'linked'))

    assert.throws(
      () => resolvePhysicalDeleteTarget(path.join(root, 'linked', 'manga'), root),
      /不在允许删除的媒体库范围内/
    )
    assert.isTrue(fs.existsSync(outsideTarget))

    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })
})
