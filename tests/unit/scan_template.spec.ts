import path from 'node:path'
import { test } from '@japa/runner'
import ScanDiscoveryService from '#services/scan/scan_discovery_service'
import {
  listConcreteScanTemplates,
  resolveScanTemplate,
} from '#services/scan/scan_template_service'
import type { ScanTemplateKey } from '#services/scan/scan_types'
import {
  parseMetadataProfileConfig,
  parseScanTemplateConfig,
} from '#services/scan/scan_config_service'
import { previewPathValidator } from '#validators/path'

const fixtureRoot = path.resolve('test-manga-data')

test.group('scan templates', () => {
  test('exposes the six supported concrete directory templates', ({ assert }) => {
    assert.lengthOf(listConcreteScanTemplates(), 6)
  })

  test('keeps legacy media settings compatible', ({ assert }) => {
    const resolveLegacy = (mediaType: number, directoryFormat: number) =>
      resolveScanTemplate({ scanTemplateKey: 'legacy', mediaType, directoryFormat }).key

    assert.equal(resolveLegacy(0, 0), 'manga_chapter_image')
    assert.equal(resolveLegacy(1, 0), 'manga_image')
    assert.equal(resolveLegacy(0, 1), 'category_manga_chapter_image')
    assert.equal(resolveLegacy(1, 1), 'category_manga_image')
  })

  const fixtures: Array<[string, ScanTemplateKey, number, number]> = [
    ['01-manga-chapter-image', 'manga_chapter_image', 2, 4],
    ['02-manga-image', 'manga_image', 2, 2],
    ['03-category-manga-chapter-image', 'category_manga_chapter_image', 2, 4],
    ['04-category-manga-image', 'category_manga_image', 2, 2],
    ['05-manga-volume-chapter-image', 'manga_volume_chapter_image', 2, 6],
    ['06-category-manga-volume-chapter-image', 'category_manga_volume_chapter_image', 2, 4],
  ]

  for (const [fixture, expectedTemplate, mangaFound, chapterFound] of fixtures) {
    test(`auto selects ${expectedTemplate} for ${fixture}`, ({ assert }) => {
      const result = new ScanDiscoveryService().discoverPath({
        pathContent: path.join(fixtureRoot, fixture),
        mediaType: 0,
        directoryFormat: 0,
        scanTemplateKey: 'auto',
        metadataProfileKey: 'auto',
        ignoreHiddenFiles: true,
        isCloudMedia: 0,
        engine: 'template-v2',
      })

      assert.isTrue(result.ok)
      assert.equal(result.template.key, expectedTemplate)
      assert.equal(result.summary.mangaFound, mangaFound)
      assert.equal(result.summary.chapterFound, chapterFound)
      assert.equal(result.summary.errors, 0)
    })
  }

  test('reports supported local metadata sources', ({ assert }) => {
    const cases = [
      ['07-smanga-metadata', 'smanga'],
      ['08-series-json-metadata', 'seriesJson'],
      ['09-comicinfo-cbz', 'comicInfoCandidate'],
    ] as const

    for (const [fixture, metadataKey] of cases) {
      const result = new ScanDiscoveryService().discoverPath({
        pathContent: path.join(fixtureRoot, fixture),
        mediaType: 0,
        directoryFormat: 0,
        scanTemplateKey: 'auto',
        metadataProfileKey: 'auto',
        ignoreHiddenFiles: true,
        isCloudMedia: 0,
        engine: 'template-v2',
      })

      assert.isAbove(result.metadataSummary[metadataKey], 0)
    }
  })

  test('combines templates per branch for the mixed fixture', ({ assert }) => {
    const result = new ScanDiscoveryService().discoverPath({
      pathContent: path.join(fixtureRoot, '10-auto-recommend-mixed'),
      mediaType: 0,
      directoryFormat: 0,
      scanTemplateKey: 'auto',
      metadataProfileKey: 'auto',
      ignoreHiddenFiles: true,
      isCloudMedia: 0,
      engine: 'template-v2',
    })

    assert.equal(result.template.key, 'auto')
    assert.equal(result.summary.mangaFound, 4)
    assert.equal(result.summary.chapterFound, 5)
    assert.deepEqual(
      result.mangas.map((manga) => manga.scanTemplateKey).sort(),
      [
        'manga_chapter_image',
        'manga_image',
        'category_manga_chapter_image',
        'manga_volume_chapter_image',
      ].sort()
    )
  })

  test('keeps template-v1 available as a runtime rollback mode', ({ assert }) => {
    const result = new ScanDiscoveryService().discoverPath({
      pathContent: path.join(fixtureRoot, '10-auto-recommend-mixed'),
      mediaType: 0,
      directoryFormat: 0,
      scanTemplateKey: 'auto',
      metadataProfileKey: 'auto',
      ignoreHiddenFiles: true,
      isCloudMedia: 0,
      engine: 'template-v1',
    })

    assert.equal(result.template.key, 'manga_chapter_image')
    assert.equal(result.summary.mangaFound, 1)
    assert.equal(result.summary.chapterFound, 2)
  })

  test('ignores hidden, empty and unsupported entries', ({ assert }) => {
    const result = new ScanDiscoveryService().discoverPath({
      pathContent: path.join(fixtureRoot, '11-noise-and-ignore'),
      mediaType: 0,
      directoryFormat: 0,
      scanTemplateKey: 'auto',
      metadataProfileKey: 'auto',
      ignoreHiddenFiles: true,
      isCloudMedia: 0,
      engine: 'template-v2',
    })

    assert.equal(result.summary.mangaFound, 1)
    assert.equal(result.summary.chapterFound, 1)
    assert.equal(result.mangas[0].mangaName, '正常漫画')
  })

  test('parses versioned custom template and metadata configuration', ({ assert }) => {
    const template = parseScanTemplateConfig(
      JSON.stringify({
        version: 1,
        strategy: 'mixed',
        rules: [
          { id: 'serial', mangaIndex: 0, chapterIndex: 1, singleChapter: false },
          { id: 'single', mangaIndex: 0, chapterIndex: null, singleChapter: true },
        ],
      })
    )
    const metadata = parseMetadataProfileConfig(
      JSON.stringify({
        version: 1,
        sources: ['series-json', 'comicinfo'],
        precedence: ['series-json', 'comicinfo'],
        overwriteExisting: false,
        maxFileBytes: 2048,
      })
    )

    assert.equal(template?.rules.length, 2)
    assert.deepEqual(metadata.sources, ['series-json', 'comicinfo'])
    assert.isFalse(metadata.overwriteExisting)
  })

  test('applies a versioned custom template during discovery', ({ assert }) => {
    const result = new ScanDiscoveryService().discoverPath({
      pathContent: path.join(fixtureRoot, '01-manga-chapter-image'),
      mediaType: 0,
      directoryFormat: 0,
      scanTemplateKey: 'custom',
      scanTemplateConfig: JSON.stringify({
        version: 1,
        strategy: 'single',
        rules: [
          {
            id: 'serial',
            label: '自定义漫画章节',
            mangaIndex: 0,
            chapterIndex: 1,
            singleChapter: false,
          },
        ],
      }),
      metadataProfileKey: 'none',
      ignoreHiddenFiles: true,
      isCloudMedia: 0,
      engine: 'template-v2',
    })

    assert.isTrue(result.ok)
    assert.equal(result.template.pattern, 'custom:serial')
    assert.equal(result.summary.mangaFound, 2)
    assert.equal(result.summary.chapterFound, 4)
  })

  test('rejects invalid versioned configuration', ({ assert }) => {
    assert.throws(
      () => parseScanTemplateConfig('{"version":2,"strategy":"mixed","rules":[]}'),
      /version=1/
    )
    assert.throws(
      () =>
        parseMetadataProfileConfig(
          '{"version":1,"sources":["unknown"],"precedence":[],"overwriteExisting":false}'
        ),
      /不支持的元数据源/
    )
  })

  test('rejects unsupported template and metadata keys at the API boundary', async ({ assert }) => {
    for (const input of [
      { scanTemplateKey: 'not-a-template' },
      { metadataProfileKey: 'not-a-profile' },
    ]) {
      try {
        await previewPathValidator.validate({ pathContent: fixtureRoot, ...input })
        assert.fail('validator should reject unsupported keys')
      } catch (error: any) {
        assert.equal(error.status, 422)
        assert.isNotEmpty(error.messages)
      }
    }
  })
})
