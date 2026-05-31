export type ScanReportLevel = 'info' | 'warning' | 'error'
export type ScanReportCategory = 'found' | 'change' | 'skipped' | 'warning' | 'error' | 'summary'

export type ScanTemplateKey =
  | 'legacy'
  | 'auto'
  | 'manga_chapter_image'
  | 'manga_image'
  | 'category_manga_chapter_image'
  | 'category_manga_image'
  | 'manga_volume_chapter_image'
  | 'category_manga_volume_chapter_image'

export type MetadataProfileKey = 'auto' | 'smanga' | 'series-json' | 'comicinfo' | 'none'

export type ScanTemplateInfo = {
  key: ScanTemplateKey
  label: string
  pattern: string
  mangaIndex: number
  chapterIndex: number | null
  singleChapter: boolean
}

export type ScanTemplateCandidate = {
  key: ScanTemplateKey
  label: string
  pattern: string
  mangaFound: number
  chapterFound: number
  score: number
}

export type ScanReportItem = {
  level: ScanReportLevel
  category: ScanReportCategory
  targetType: 'path' | 'directory' | 'manga' | 'chapter' | 'file' | 'rule'
  action?: 'found' | 'create' | 'update' | 'delete' | 'skip' | 'none'
  reasonCode?: string
  reason?: string
  targetName?: string
  targetPath?: string
  extra?: Record<string, any>
}

export type DiscoveredChapter = {
  chapterName: string
  chapterPath: string
  fileName: string
  chapterType: string
}

export type DiscoveredManga = {
  mangaPath: string
  mangaName: string
  mangaType: string
  parentPath: string
  scanTemplateKey?: string
  chapters: DiscoveredChapter[]
}

export type ScanDiscoveryInput = {
  mediaId?: number
  pathId?: number
  pathContent: string
  mediaType: number
  directoryFormat: number
  scanTemplateKey?: string | null
  scanTemplateConfig?: string | null
  metadataProfileKey?: string | null
  metadataProfileConfig?: string | null
  include?: string | null
  exclude?: string | null
  ignoreHiddenFiles: boolean
  isCloudMedia?: number
  sampleLimit?: number
}

export type ScanDiscoverySummary = {
  mangaFound: number
  chapterFound: number
  skipped: number
  warnings: number
  errors: number
}

export type ScanMetadataSummary = {
  smanga: number
  smangaSidecar: number
  seriesJson: number
  comicInfoCandidate: number
}

export type ScanDiscoveryResult = {
  ok: boolean
  summary: ScanDiscoverySummary
  template: ScanTemplateInfo
  templateCandidates: ScanTemplateCandidate[]
  metadataSummary: ScanMetadataSummary
  mangas: DiscoveredManga[]
  samples: DiscoveredManga[]
  items: ScanReportItem[]
}
