import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from '@japa/runner'
import sharp from 'sharp'
import CopyPosterJob from '#services/copy_poster_job'
import { isManagedCover } from '#services/library_path_service'
import { copiedPosterPath, path_poster } from '#utils/index'

test.group('copied posters', () => {
  test('groups new copies by kind and ID while keeping both layouts deletable', ({ assert }) => {
    const manga = copiedPosterPath('manga', 999)
    const chapter = copiedPosterPath('chapter', 1000)
    assert.equal(manga, path.join(path_poster(), 'manga', '0', 'smanga_manga_999.jpg'))
    assert.equal(chapter, path.join(path_poster(), 'chapter', '1', 'smanga_chapter_1000.jpg'))
    assert.isTrue(isManagedCover(manga, 'manga', 999))
    assert.isTrue(isManagedCover(chapter, 'chapter', 1000))
    assert.isTrue(
      isManagedCover(path.join(path_poster(), 'smanga_chapter_1000.jpg'), 'chapter', 1000)
    )
    assert.isFalse(isManagedCover(chapter, 'chapter', 1001))
  })

  test('creates the bucket on the first copy and honors an already queued flat target', async ({
    assert,
  }) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smanga-copy-poster-test-'))
    try {
      const inputPath = path.join(directory, 'source.jpg')
      const jpeg = await sharp({
        create: { width: 16, height: 16, channels: 3, background: 'blue' },
      })
        .jpeg()
        .toBuffer()
      await fs.writeFile(inputPath, jpeg)

      const poster = path.join(directory, 'poster')
      const bucketed = path.join(
        poster,
        path.relative(path_poster(), copiedPosterPath('chapter', 1000))
      )
      const flat = path.join(poster, 'smanga_chapter_1001.jpg')
      for (const outputPath of [bucketed, flat]) {
        await new CopyPosterJob({ inputPath, outputPath, maxSizeKB: 300 }).run()
        assert.isTrue((await fs.readFile(outputPath)).equals(jpeg))
      }
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})
