import type { MetadataProfileKey, ScanTemplateInfo, ScanTemplateKey } from './scan_types.js'

export const SCAN_TEMPLATES: Record<Exclude<ScanTemplateKey, 'legacy' | 'auto'>, ScanTemplateInfo> = {
  manga_chapter_image: {
    key: 'manga_chapter_image',
    label: '漫画 > 章节 > 图片',
    pattern: 'manga > chapter > image',
    mangaIndex: 0,
    chapterIndex: 1,
    singleChapter: false,
  },
  manga_image: {
    key: 'manga_image',
    label: '漫画 > 图片',
    pattern: 'manga > image',
    mangaIndex: 0,
    chapterIndex: null,
    singleChapter: true,
  },
  category_manga_chapter_image: {
    key: 'category_manga_chapter_image',
    label: '分类 > 漫画 > 章节 > 图片',
    pattern: 'category > manga > chapter > image',
    mangaIndex: 1,
    chapterIndex: 2,
    singleChapter: false,
  },
  category_manga_image: {
    key: 'category_manga_image',
    label: '分类 > 漫画 > 图片',
    pattern: 'category > manga > image',
    mangaIndex: 1,
    chapterIndex: null,
    singleChapter: true,
  },
  manga_volume_chapter_image: {
    key: 'manga_volume_chapter_image',
    label: '漫画 > 卷/目录 > 章节 > 图片',
    pattern: 'manga > volume > chapter > image',
    mangaIndex: 0,
    chapterIndex: 2,
    singleChapter: false,
  },
  category_manga_volume_chapter_image: {
    key: 'category_manga_volume_chapter_image',
    label: '分类 > 漫画 > 卷/目录 > 章节 > 图片',
    pattern: 'category > manga > volume > chapter > image',
    mangaIndex: 1,
    chapterIndex: 3,
    singleChapter: false,
  },
}

const LEGACY_TEMPLATE: ScanTemplateInfo = {
  key: 'legacy',
  label: '兼容旧媒体库设置',
  pattern: 'legacy',
  mangaIndex: 0,
  chapterIndex: 1,
  singleChapter: false,
}

export const METADATA_PROFILES: Array<{ key: MetadataProfileKey; label: string; description: string }> = [
  { key: 'auto', label: '自动识别', description: '.smanga 优先，其次 series.json 和 ComicInfo.xml' },
  { key: 'smanga', label: 'SMANGA 元数据', description: '只扫描 .smanga 或 *-smanga-info' },
  { key: 'series-json', label: 'series.json', description: '只扫描漫画目录中的 series.json' },
  { key: 'comicinfo', label: 'ComicInfo.xml', description: '只扫描压缩章节内的 ComicInfo.xml' },
  { key: 'none', label: '不扫描元数据', description: '只建立漫画和章节' },
]

export function legacyScanTemplateKey(mediaType = 0, directoryFormat = 0): Exclude<ScanTemplateKey, 'legacy' | 'auto'> {
  if (directoryFormat === 1 && mediaType === 1) return 'category_manga_image'
  if (directoryFormat === 1) return 'category_manga_chapter_image'
  if (mediaType === 1) return 'manga_image'
  return 'manga_chapter_image'
}

export function resolveScanTemplate(input: {
  scanTemplateKey?: string | null
  mediaType?: number | null
  directoryFormat?: number | null
}): ScanTemplateInfo {
  const key = input.scanTemplateKey as ScanTemplateKey | null | undefined

  if (!key || key === 'legacy') {
    return SCAN_TEMPLATES[legacyScanTemplateKey(input.mediaType || 0, input.directoryFormat || 0)]
  }

  if (key === 'auto') {
    return {
      ...LEGACY_TEMPLATE,
      key: 'auto',
      label: '自动推荐',
      pattern: 'auto',
    }
  }

  return SCAN_TEMPLATES[key as Exclude<ScanTemplateKey, 'legacy' | 'auto'>] || SCAN_TEMPLATES.manga_chapter_image
}

export function listConcreteScanTemplates() {
  return Object.values(SCAN_TEMPLATES)
}

export function normalizeMetadataProfile(key?: string | null): MetadataProfileKey {
  return METADATA_PROFILES.some((profile) => profile.key === key) ? (key as MetadataProfileKey) : 'auto'
}
