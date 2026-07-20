import path from 'node:path'
import { test } from '@japa/runner'
import ScanDiscoveryService from '#services/scan/scan_discovery_service'
import {
  listConcreteScanTemplates,
  resolveScanTemplate,
} from '#services/scan/scan_template_service'
import type { ScanTemplateKey } from '#services/scan/scan_types'

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

  const fixtures: Array<[string, ScanTemplateKey]> = [
    ['01-manga-chapter-image', 'manga_chapter_image'],
    ['02-manga-image', 'manga_image'],
    ['03-category-manga-chapter-image', 'category_manga_chapter_image'],
    ['04-category-manga-image', 'category_manga_image'],
    ['05-manga-volume-chapter-image', 'manga_volume_chapter_image'],
    ['06-category-manga-volume-chapter-image', 'category_manga_volume_chapter_image'],
  ]

  for (const [fixture, expectedTemplate] of fixtures) {
    test(`auto selects ${expectedTemplate} for ${fixture}`, ({ assert }) => {
      const result = new ScanDiscoveryService().discoverPath({
        pathContent: path.join(fixtureRoot, fixture),
        mediaType: 0,
        directoryFormat: 0,
        scanTemplateKey: 'auto',
        metadataProfileKey: 'auto',
        ignoreHiddenFiles: true,
        isCloudMedia: 0,
      })

      assert.isTrue(result.ok)
      assert.equal(result.template.key, expectedTemplate)
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
      })

      assert.isAbove(result.metadataSummary[metadataKey], 0)
    }
  })
})
