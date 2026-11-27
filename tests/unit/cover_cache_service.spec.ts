import { buffer } from 'node:stream/consumers'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from '@japa/runner'
import sharp from 'sharp'
import {
  cacheCover,
  cacheMetaImage,
  coverCacheFile,
  openCachedCover,
} from '#services/cover_cache_service'

test.group('cover cache', () => {
  test('uses a stable, versioned bucket per cover type', ({ assert }) => {
    const first = coverCacheFile('chapter', 123456, 'original')
    assert.equal(path.basename(path.dirname(first)), '123')
    assert.equal(coverCacheFile('chapter', 123456, 'original'), first)
    assert.notEqual(coverCacheFile('chapter', 123456, 'updated'), first)
    assert.notEqual(coverCacheFile('manga', 123456, 'original'), first)
    const artwork = coverCacheFile('meta', 123456, 'original')
    assert.equal(path.basename(path.dirname(path.dirname(artwork))), 'meta')
    assert.equal(path.extname(artwork), '.original')
  })

  test('merges concurrent cache misses and serves the cover after the source disappears', async ({
    assert,
  }) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smanga-cover-test-'))
    try {
      const source = path.join(directory, 'source.png')
      const cached = path.join(directory, 'cache', 'cover.webp')
      await sharp({ create: { width: 800, height: 1200, channels: 3, background: 'blue' } })
        .png()
        .toFile(source)
      assert.isNull(await openCachedCover(cached))

      let sourceRequests = 0
      const generate = () =>
        cacheCover(cached, async () => {
          sourceRequests++
          return source
        }).then(buffer)
      const [first, second] = await Promise.all([generate(), generate()])
      assert.equal(sourceRequests, 1)
      assert.isTrue(first.equals(second))
      const { format, width, height } = await sharp(first).metadata()
      assert.equal(format, 'webp')
      assert.equal(width, 600)
      assert.equal(height, 900)

      await fs.unlink(source)
      const hit = await openCachedCover(cached)
      assert.isTrue(!!hit && (await buffer(hit)).equals(first))
      assert.deepEqual(await fs.readdir(path.dirname(cached)), ['cover.webp'])
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  test('stores a metadata banner without modifying its format, dimensions, or transparency', async ({
    assert,
  }) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smanga-meta-image-test-'))
    try {
      const source = path.join(directory, 'banner.png')
      const cached = path.join(directory, 'cache', 'banner.original')
      const png = await sharp({
        create: {
          width: 1800,
          height: 500,
          channels: 4,
          background: { r: 20, g: 50, b: 255, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer()
      await fs.writeFile(source, png)
      const first = await buffer(await cacheMetaImage(cached, async () => source))
      assert.isTrue(first.equals(png))

      await fs.unlink(source)
      const hit = await openCachedCover(cached)
      assert.isTrue(!!hit && (await buffer(hit)).equals(png))
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})
