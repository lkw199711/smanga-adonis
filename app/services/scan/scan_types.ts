export type ScanReportLevel = 'info' | 'warning' | 'error'
export type ScanReportCategory = 'found' | 'change' | 'skipped' | 'warning' | 'error' | 'summary'

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
  chapters: DiscoveredChapter[]
}

export type ScanDiscoveryInput = {
  mediaId?: number
  pathId?: number
  pathContent: string
  mediaType: number
  directoryFormat: number
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

export type ScanDiscoveryResult = {
  ok: boolean
  summary: ScanDiscoverySummary
  mangas: DiscoveredManga[]
  samples: DiscoveredManga[]
  items: ScanReportItem[]
}
