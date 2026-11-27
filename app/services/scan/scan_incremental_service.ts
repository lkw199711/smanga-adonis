import { createHash } from 'node:crypto'
import type { Stats } from 'node:fs'
import path from 'node:path'
import type { ReusableMangaScan, ScanDiscoveryInput } from './scan_types.js'

const recheckAfterMs = 24 * 60 * 60_000

export type MangaScanSnapshot = Omit<ReusableMangaScan, 'chapterCount'> & {
  scanKey: string
  checkedAt: string
}

export function scanPathKey(file: string) {
  const normalized = path.resolve(file)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function sourceFingerprint(stat: Stats) {
  return `${stat.isDirectory() ? 'directory' : 'file'}:${stat.mtimeMs}:${stat.size}`
}

export function scanConfigKey(settings: unknown[]) {
  return createHash('sha256').update(JSON.stringify([1, ...settings])).digest('hex')
}

export function canReuseMangaScan(state: { scanKey: string; checkedAt: Date }, key: string, now: Date) {
  const age = now.getTime() - state.checkedAt.getTime()
  return state.scanKey === key && age >= 0 && age < recheckAfterMs
}

export function mangaScanInput(
  pathContent: string,
  source: Pick<ScanDiscoveryInput, 'pathId' | 'mediaId' | 'scanTemplateKey' | 'scanTemplateConfig' |
    'metadataProfileKey' | 'metadataProfileConfig' | 'include' | 'exclude'>,
  media: Pick<ScanDiscoveryInput, 'mediaType' | 'directoryFormat' | 'isCloudMedia'>,
  engine: ScanDiscoveryInput['engine'],
  ignoreHiddenFiles: boolean
): ScanDiscoveryInput {
  return {
    pathContent,
    pathId: source.pathId,
    mediaId: source.mediaId,
    scanTemplateKey: source.scanTemplateKey,
    scanTemplateConfig: source.scanTemplateConfig,
    metadataProfileKey: source.metadataProfileKey,
    metadataProfileConfig: source.metadataProfileConfig,
    include: source.include,
    exclude: source.exclude,
    mediaType: media.mediaType,
    directoryFormat: media.directoryFormat,
    isCloudMedia: media.isCloudMedia,
    engine,
    ignoreHiddenFiles,
  }
}
