import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'
import { test } from '@japa/runner'
import { extract_cover } from '#utils/unzip'
import { first_archive_cover_or_image, first_archive_image } from '#utils/index'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')

test.group('archive cover sort', () => {
  test('selects the first image after natural path sorting', ({ assert }) => {
    const firstImage = first_archive_image([
      '010.jpg',
      '002-cover.jpg',
      '__MACOSX/001.jpg',
      '._000.jpg',
      '001.jpg',
    ])

    assert.equal(firstImage, '001.jpg')
  })

  test('selects a cover image before falling back to sorted first image', ({ assert }) => {
    const coverImage = first_archive_cover_or_image(['001.jpg', '002-cover.jpg', '010.jpg'])

    assert.equal(coverImage, '002-cover.jpg')
  })

  test('extracts a zip cover image before falling back to sorted first image', async ({
    assert,
  }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smanga-archive-cover-'))
    const zipPath = path.join(tmpDir, 'chapter.zip')
    const outputPath = path.join(tmpDir, 'cover.jpg')

    try {
      const zip = new AdmZip()
      zip.addFile('003.jpg', Buffer.from('third'))
      zip.addFile('002-cover.jpg', Buffer.from('second-cover'))
      zip.addFile('001.jpg', Buffer.from('first'))
      zip.writeZip(zipPath)

      const extracted = await extract_cover(zipPath, outputPath)

      assert.isTrue(extracted)
      assert.equal(fs.readFileSync(outputPath, 'utf8'), 'second-cover')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('falls back to the sorted first zip image when no cover image exists', async ({
    assert,
  }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smanga-archive-cover-'))
    const zipPath = path.join(tmpDir, 'chapter.zip')
    const outputPath = path.join(tmpDir, 'cover.jpg')

    try {
      const zip = new AdmZip()
      zip.addFile('003.jpg', Buffer.from('third'))
      zip.addFile('010.jpg', Buffer.from('tenth'))
      zip.addFile('001.jpg', Buffer.from('first'))
      zip.writeZip(zipPath)

      const extracted = await extract_cover(zipPath, outputPath)

      assert.isTrue(extracted)
      assert.equal(fs.readFileSync(outputPath, 'utf8'), 'first')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
