import { test } from '@japa/runner'
import path from 'node:path'
import { resolveLibraryFiles } from '../../app/services/library_file_response.js'
import { LibraryPathContext, isManagedCover } from '../../app/services/library_path_service.js'
import { path_poster } from '../../app/utils/index.js'

test.group('library file responses', () => {
  test('resolves covers and metadata in one batch with the current root', async ({ assert }) => {
    const rootPath = path.resolve('new-mount')
    const oldCover = path.resolve('legacy', 'cover.jpg')
    const rows = [
      {
        pathId: 11,
        mangaCover: 'manga/book/cover.jpg',
        metas: [{ metaFile: 'manga/book/banner.jpg' }],
      },
      { pathId: 11, chapterCover: 'manga/book/001.jpg' },
      { pathId: 12, chapterCover: 'manga/other/001.jpg' },
      { pathId: 13, mangaCover: oldCover },
    ]
    let calls = 0
    const resolved = await resolveLibraryFiles(rows, async (ids) => {
      calls++
      assert.deepEqual(ids, [11, 12])
      const root = { storageRootId: 1, rootPath, enabled: 1, deleteFlag: 0 }
      return ids.map((pathId) => ({ pathId, storageRootId: 1, storageRoot: root }))
    })
    assert.equal(calls, 1)
    assert.equal(resolved[0].mangaCover, path.join(rootPath, 'manga/book/cover.jpg'))
    assert.equal(resolved[0].metas?.[0].metaFile, path.join(rootPath, 'manga/book/banner.jpg'))
    assert.equal(resolved[1].chapterCover, path.join(rootPath, 'manga/book/001.jpg'))
    assert.equal(resolved[2].chapterCover, path.join(rootPath, 'manga/other/001.jpg'))
    assert.equal(resolved[3].mangaCover, oldCover)
    assert.equal(rows[0].mangaCover, 'manga/book/cover.jpg')
  })

  test('preserves cached and legacy files when some relative sources are unavailable', async ({
    assert,
  }) => {
    const cache = path.resolve('cache', 'cover.jpg')
    const resolved = await resolveLibraryFiles(
      [
        { pathId: 11, mangaCover: 'source/cover.jpg', chapterCover: cache },
        { pathId: 12, mangaCover: '../outside.jpg' },
        { pathId: 13, mangaCover: './old-cache.jpg' },
        { pathId: 14, mangaCover: 'source/cover.jpg' },
      ],
      async () => [
        {
          pathId: 11,
          storageRootId: 1,
          storageRoot: {
            storageRootId: 1,
            rootPath: path.resolve('disabled'),
            enabled: 0,
            deleteFlag: 0,
          },
        },
        {
          pathId: 12,
          storageRootId: 2,
          storageRoot: {
            storageRootId: 2,
            rootPath: path.resolve('online'),
            enabled: 1,
            deleteFlag: 0,
          },
        },
        { pathId: 13, storageRootId: null },
      ]
    )
    assert.isNull(resolved[0].mangaCover)
    assert.equal(resolved[0].chapterCover, cache)
    assert.isNull(resolved[1].mangaCover)
    assert.equal(resolved[2].mangaCover, './old-cache.jpg')
    assert.isNull(resolved[3].mangaCover)
  })

  test('stores selected source covers as relative paths and identifies app-owned covers', ({
    assert,
  }) => {
    const rootPath = path.resolve('mount')
    const context = new LibraryPathContext({
      storageRootId: 1,
      storageRoot: { storageRootId: 1, rootPath, enabled: 1, deleteFlag: 0 },
    })
    const source = path.join(rootPath, 'book', 'smanga_manga_1.jpg')
    const cached = path.join(path_poster(), 'smanga_manga_1.jpg')
    assert.equal(context.toStoredCoverPath(source), 'book/smanga_manga_1.jpg')
    assert.equal(context.toStoredCoverPath(cached), cached)
    assert.isFalse(isManagedCover(source, 'manga', 1))
    assert.isFalse(isManagedCover('book/smanga_manga_1.jpg', 'manga', 1))
    assert.isTrue(isManagedCover(cached, 'manga', 1))
    assert.isTrue(isManagedCover(path.join(path_poster(), 'smanga_manga_1_meta_5.png'), 'manga', 1))
  })
})
