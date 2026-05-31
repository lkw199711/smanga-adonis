import * as fs from 'fs'
import * as path from 'path'
import { is_img } from '#utils/index'
import {
  listConcreteScanTemplates,
  normalizeMetadataProfile,
  resolveScanTemplate,
} from './scan_template_service.js'
import type {
  DiscoveredChapter,
  DiscoveredManga,
  ScanDiscoveryInput,
  ScanDiscoveryResult,
  ScanMetadataSummary,
  ScanReportItem,
  ScanTemplateCandidate,
  ScanTemplateInfo,
} from './scan_types.js'

const COMPRESS_EXTENSIONS: Record<string, string> = {
  '.zip': 'zip',
  '.cbz': 'zip',
  '.cbr': 'zip',
  '.epub': 'zip',
  '.rar': 'rar',
  '.7z': '7z',
  '.pdf': 'pdf',
}

type CandidateEntry = {
  name: string
  entryPath: string
  parentPath: string
  ancestors: string[]
  stat: fs.Stats
}

export default class ScanDiscoveryService {
  private items: ScanReportItem[] = []
  private input!: ScanDiscoveryInput
  private emitItems = true
  private activeTemplate!: ScanTemplateInfo
  private templateCandidates: ScanTemplateCandidate[] = []

  discoverPath(input: ScanDiscoveryInput): ScanDiscoveryResult {
    this.input = input
    this.items = []
    this.templateCandidates = []

    const pathContent = input.pathContent
    const sampleLimit = input.sampleLimit ?? 5

    const basicFailure = this.validatePath(pathContent)
    if (basicFailure) return basicFailure

    const includeValid = this.validateRule(input.include, 'include')
    const excludeValid = this.validateRule(input.exclude, 'exclude')
    if (!includeValid || !excludeValid) {
      this.activeTemplate = resolveScanTemplate(input)
      return this.result([], this.activeTemplate)
    }

    const resolvedTemplate = resolveScanTemplate(input)
    const template =
      resolvedTemplate.key === 'auto'
        ? this.selectTemplate(pathContent)
        : resolvedTemplate

    this.activeTemplate = template
    this.items = []
    this.emitItems = true

    const mangas = this.discoverWithTemplate(pathContent, template)
    this.addStructureWarnings(pathContent, mangas, template)
    this.addFoundItems(mangas, template)

    return {
      ...this.result(mangas, template),
      samples: mangas.slice(0, sampleLimit),
    }
  }

  private validatePath(pathContent: string): ScanDiscoveryResult | null {
    const fallbackTemplate = resolveScanTemplate(this.input)
    this.activeTemplate = fallbackTemplate

    if (!pathContent) {
      this.error('path', 'PATH_EMPTY', '扫描路径不能为空', undefined, pathContent)
      return this.result([], fallbackTemplate)
    }

    if (!fs.existsSync(pathContent)) {
      this.error('path', 'PATH_NOT_EXISTS', '路径不存在', undefined, pathContent)
      return this.result([], fallbackTemplate)
    }

    if (!this.safeStat(pathContent)?.isDirectory()) {
      this.error('path', 'PATH_NOT_DIRECTORY', '扫描路径不是目录', undefined, pathContent)
      return this.result([], fallbackTemplate)
    }

    return null
  }

  private selectTemplate(pathContent: string) {
    let selected = listConcreteScanTemplates()[0]
    let selectedScore = Number.NEGATIVE_INFINITY

    this.templateCandidates = listConcreteScanTemplates().map((template) => {
      this.emitItems = false
      const mangas = this.discoverWithTemplate(pathContent, template)
      const mangaFound = mangas.length
      const chapterFound = mangas.reduce((sum, manga) => sum + manga.chapters.length, 0)
      const score = this.scoreTemplate(template, mangas)

      if (score > selectedScore) {
        selected = template
        selectedScore = score
      }

      return {
        key: template.key,
        label: template.label,
        pattern: template.pattern,
        mangaFound,
        chapterFound,
        score,
      }
    })

    this.templateCandidates.sort((a, b) => b.score - a.score)
    this.emitItems = true

    this.items.push({
      level: 'info',
      category: 'summary',
      targetType: 'path',
      action: 'none',
      reasonCode: 'SCAN_TEMPLATE_AUTO_SELECTED',
      reason: `已自动选择扫描模板: ${selected.label}`,
      targetPath: pathContent,
      extra: {
        scanTemplateKey: selected.key,
        pattern: selected.pattern,
        candidates: this.templateCandidates.slice(0, 5),
      },
    })

    return selected
  }

  private scoreTemplate(template: ScanTemplateInfo, mangas: DiscoveredManga[]) {
    const mangaFound = mangas.length
    const chapterFound = mangas.reduce((sum, manga) => sum + manga.chapters.length, 0)
    const avgChapters = mangaFound ? chapterFound / mangaFound : 0
    let score = chapterFound * 20 + mangaFound * 10 + avgChapters * 40

    for (const manga of mangas) {
      if (this.looksLikeChapterName(manga.mangaName) || this.looksLikeVolumeName(manga.mangaName)) {
        score -= 45
      }

      if (!template.singleChapter) {
        for (const chapter of manga.chapters) {
          if (!this.looksLikeChapterName(chapter.chapterName) && !this.looksLikeArchiveChapter(chapter.fileName)) {
            score -= 12
          }
          if (this.templateHasIntermediateFolder(template) && !this.chapterHasVolumeIntermediate(chapter.chapterName)) {
            score -= 35
          }
        }
      }
    }

    if (template.singleChapter) score -= mangaFound * 8
    score -= template.mangaIndex * 3
    score -= template.chapterIndex ? template.chapterIndex : 0

    return Math.round(score)
  }

  private discoverWithTemplate(root: string, template: ScanTemplateInfo) {
    const mangas: DiscoveredManga[] = []
    const mangaCandidates = this.collectEntriesAtDepth(root, template.mangaIndex)

    for (const candidate of mangaCandidates) {
      if (this.isMetadataDirectory(candidate.name)) {
        this.skip('directory', 'METADATA_DIRECTORY', '元数据目录不会作为漫画扫描', candidate.name, candidate.entryPath)
        continue
      }

      const mangaType = this.resolveMangaType(candidate.entryPath)
      if (mangaType === 'other') {
        this.skip('file', 'UNSUPPORTED_MANGA_FILE', '不支持的文件类型不会作为漫画扫描', candidate.name, candidate.entryPath)
        continue
      }

      const manga: DiscoveredManga = {
        mangaPath: candidate.entryPath,
        mangaName: candidate.name,
        mangaType,
        parentPath: candidate.parentPath,
        scanTemplateKey: template.key,
        chapters: [],
      }

      if (!this.shouldIncludeManga(manga)) continue

      if (template.singleChapter) {
        const chapter = this.singleChapterForManga(manga)
        if (!chapter) continue
        manga.chapters = [chapter]
      } else {
        manga.chapters = this.discoverChapters(manga, template)
        if (!manga.chapters.length) {
          this.skip('manga', 'NO_CHAPTER_FOUND', '按当前模板未在漫画下识别到章节', manga.mangaName, manga.mangaPath)
          continue
        }
      }

      mangas.push(manga)
    }

    return mangas
  }

  private singleChapterForManga(manga: DiscoveredManga): DiscoveredChapter | null {
    const stat = this.safeStat(manga.mangaPath)
    if (!stat) return null

    if (stat.isDirectory() && !this.hasDirectContentImages(manga.mangaPath)) {
      this.skip('manga', 'NO_DIRECT_IMAGE', '单本模板要求漫画目录下直接包含图片', manga.mangaName, manga.mangaPath)
      return null
    }

    return {
      chapterName: manga.mangaName,
      chapterPath: manga.mangaPath,
      fileName: path.basename(manga.mangaPath),
      chapterType: manga.mangaType,
    }
  }

  private discoverChapters(manga: DiscoveredManga, template: ScanTemplateInfo) {
    const stat = this.safeStat(manga.mangaPath)
    if (!stat?.isDirectory()) {
      this.skip('manga', 'MANGA_FILE_IN_SERIAL_TEMPLATE', '当前模板需要从漫画目录下继续识别章节', manga.mangaName, manga.mangaPath)
      return []
    }

    const chapterEntryDepth = Math.max((template.chapterIndex ?? 1) - template.mangaIndex - 1, 0)
    const entries = this.collectEntriesAtDepth(manga.mangaPath, chapterEntryDepth)
    const chapters: DiscoveredChapter[] = []

    for (const entry of entries) {
      const chapterType = this.resolveChapterType(entry.entryPath)
      if (!chapterType) {
        if (entry.stat.isDirectory() && this.hasChildDirectories(entry.entryPath)) {
          this.skip(
            'chapter',
            'NESTED_CHAPTER_DIRECTORY',
            '章节层级下仍有子目录，当前模板不会继续合并更深层级',
            entry.name,
            entry.entryPath
          )
        } else {
          this.skip('file', 'UNSUPPORTED_CHAPTER_FILE', '不支持的文件类型不会作为章节扫描', entry.name, entry.entryPath)
        }
        continue
      }

      const ancestorName = entry.ancestors.length ? `${entry.ancestors.join(' / ')} / ` : ''
      const chapterName = `${ancestorName}${path.basename(entry.name, path.extname(entry.name))}`
      chapters.push({
        chapterName,
        chapterPath: entry.entryPath,
        fileName: entry.name,
        chapterType,
      })
    }

    return chapters
  }

  private collectEntriesAtDepth(root: string, targetDepth: number) {
    const result: CandidateEntry[] = []
    const visit = (dir: string, depth: number, ancestors: string[]) => {
      const entries = this.safeReadDir(dir, depth === 0 ? 'path' : 'directory')

      for (const entry of entries) {
        const entryPath = path.join(dir, entry)
        if (this.shouldSkipEntry(entry, entryPath)) continue

        const stat = this.safeStat(entryPath)
        if (!stat) continue

        if (depth === targetDepth) {
          result.push({
            name: entry,
            entryPath,
            parentPath: dir,
            ancestors,
            stat,
          })
          continue
        }

        if (stat.isDirectory()) {
          visit(entryPath, depth + 1, [...ancestors, entry])
        }
      }
    }

    visit(root, 0, [])
    return result
  }

  private addFoundItems(mangas: DiscoveredManga[], template: ScanTemplateInfo) {
    for (const manga of mangas) {
      this.items.push({
        level: 'info',
        category: 'found',
        targetType: 'manga',
        action: 'found',
        targetName: manga.mangaName,
        targetPath: manga.mangaPath,
        extra: {
          mangaType: manga.mangaType,
          chapterCount: manga.chapters.length,
          scanTemplateKey: template.key,
          scanTemplatePattern: template.pattern,
        },
      })
    }
  }

  private addStructureWarnings(pathContent: string, mangas: DiscoveredManga[], template: ScanTemplateInfo) {
    if (!mangas.length) {
      this.items.push({
        level: 'warning',
        category: 'warning',
        targetType: 'path',
        reasonCode: 'NO_MANGA_FOUND',
        reason: '按当前扫描模板没有识别到漫画',
        targetPath: pathContent,
        extra: {
          scanTemplateKey: template.key,
          pattern: template.pattern,
          candidates: this.templateCandidates.slice(0, 5),
        },
      })
    }
  }

  private resolveMangaType(filePath: string) {
    const stat = this.safeStat(filePath)
    if (stat?.isDirectory()) return 'img'

    const ext = path.extname(filePath).toLowerCase()
    return COMPRESS_EXTENSIONS[ext] || 'other'
  }

  private resolveChapterType(filePath: string) {
    const stat = this.safeStat(filePath)
    if (stat?.isDirectory()) {
      return this.hasDirectContentImages(filePath) ? 'img' : ''
    }

    const ext = path.extname(filePath).toLowerCase()
    return COMPRESS_EXTENSIONS[ext] || ''
  }

  private shouldIncludeManga(manga: Pick<DiscoveredManga, 'mangaName' | 'mangaPath' | 'mangaType'>) {
    if (manga.mangaType === 'other') return false

    const target = `${manga.mangaName}\n${manga.mangaPath}`
    if (this.input.include && !new RegExp(this.input.include).test(target)) {
      this.skip('manga', 'INCLUDE_NOT_MATCHED', '未匹配 include 规则', manga.mangaName, manga.mangaPath)
      return false
    }

    if (this.input.exclude && new RegExp(this.input.exclude).test(target)) {
      this.skip('manga', 'EXCLUDE_MATCHED', '匹配 exclude 规则', manga.mangaName, manga.mangaPath)
      return false
    }

    return true
  }

  private metadataSummary(mangas: DiscoveredManga[]): ScanMetadataSummary {
    const profile = normalizeMetadataProfile(this.input.metadataProfileKey)
    const summary: ScanMetadataSummary = {
      smanga: 0,
      smangaSidecar: 0,
      seriesJson: 0,
      comicInfoCandidate: 0,
    }

    if (profile === 'none') return summary

    for (const manga of mangas) {
      if (this.safeStat(manga.mangaPath)?.isDirectory()) {
        if (profile === 'auto' || profile === 'smanga') {
          if (fs.existsSync(path.join(manga.mangaPath, '.smanga'))) summary.smanga += 1
          if (fs.existsSync(`${manga.mangaPath}-smanga-info`)) summary.smangaSidecar += 1
        }

        if ((profile === 'auto' || profile === 'series-json') && fs.existsSync(path.join(manga.mangaPath, 'series.json'))) {
          summary.seriesJson += 1
        }
      }

      if (profile === 'auto' || profile === 'comicinfo') {
        summary.comicInfoCandidate += manga.chapters.filter((chapter) => chapter.chapterType === 'zip').length
      }
    }

    return summary
  }

  private hasDirectContentImages(dir: string) {
    if (!this.safeStat(dir)?.isDirectory()) return false
    return this.safeReadDir(dir, 'directory').some((entry) => {
      const entryPath = path.join(dir, entry)
      return is_img(entryPath) && !this.isNonContentImage(entry)
    })
  }

  private hasChildDirectories(dir: string) {
    if (!this.safeStat(dir)?.isDirectory()) return false
    return this.safeReadDir(dir, 'directory').some((entry) => this.safeStat(path.join(dir, entry))?.isDirectory())
  }

  private isNonContentImage(name: string) {
    const baseName = path.basename(name, path.extname(name)).toLowerCase()
    return ['cover', 'folder', 'poster', 'banner', 'thumbnail'].includes(baseName)
  }

  private looksLikeChapterName(name: string) {
    return /(第\s*\d+\s*[话話回章]|chapter\s*\d+|ch\.?\s*\d+|ep\.?\s*\d+)/i.test(name)
  }

  private looksLikeVolumeName(name: string) {
    return /(第\s*\d+\s*卷|vol\.?\s*\d+|volume\s*\d+|part\s*\d+|上卷|下卷)/i.test(name)
  }

  private looksLikeArchiveChapter(name: string) {
    return Boolean(COMPRESS_EXTENSIONS[path.extname(name).toLowerCase()])
  }

  private templateHasIntermediateFolder(template: ScanTemplateInfo) {
    return template.chapterIndex !== null && template.chapterIndex - template.mangaIndex > 1
  }

  private chapterHasVolumeIntermediate(name: string) {
    const firstPart = name.split('/')[0]?.trim() || ''
    return this.looksLikeVolumeName(firstPart)
  }

  private isMetadataDirectory(name: string) {
    return name === '.smanga' || /smanga-info/.test(name)
  }

  private validateRule(rule: string | null | undefined, name: string) {
    if (!rule) return true

    try {
      new RegExp(rule)
      return true
    } catch (e: any) {
      this.items.push({
        level: 'error',
        category: 'error',
        targetType: 'rule',
        reasonCode: 'REGEX_INVALID',
        reason: `${name} 规则不是有效正则: ${e?.message || e}`,
        targetName: name,
      })
      return false
    }
  }

  private safeReadDir(dir: string, targetType: ScanReportItem['targetType']) {
    try {
      return fs.readdirSync(dir)
    } catch (e: any) {
      if (this.emitItems) {
        this.items.push({
          level: 'error',
          category: 'error',
          targetType,
          reasonCode: 'READ_DIR_FAILED',
          reason: e?.message || '目录读取失败',
          targetPath: dir,
        })
      }
      return []
    }
  }

  private safeStat(filePath: string) {
    try {
      return fs.statSync(filePath)
    } catch (e: any) {
      if (this.emitItems) {
        this.items.push({
          level: 'warning',
          category: 'warning',
          targetType: 'file',
          reasonCode: 'STAT_FAILED',
          reason: e?.message || '文件状态读取失败',
          targetPath: filePath,
        })
      }
      return null
    }
  }

  private shouldSkipEntry(name: string, filePath: string) {
    if (name === '.' || name === '..') return true

    if (this.isMetadataDirectory(name)) {
      this.skip('directory', 'METADATA_DIRECTORY', '元数据目录不会作为漫画或章节扫描', name, filePath)
      return true
    }

    if (this.input.ignoreHiddenFiles && /^\./.test(name)) {
      this.skip('file', 'HIDDEN_FILE', '已按设置忽略隐藏文件或目录', name, filePath)
      return true
    }

    return false
  }

  private skip(
    targetType: ScanReportItem['targetType'],
    reasonCode: string,
    reason: string,
    targetName?: string,
    targetPath?: string
  ) {
    if (!this.emitItems) return

    this.items.push({
      level: 'info',
      category: 'skipped',
      targetType,
      action: 'skip',
      reasonCode,
      reason,
      targetName,
      targetPath,
    })
  }

  private error(
    targetType: ScanReportItem['targetType'],
    reasonCode: string,
    reason: string,
    targetName?: string,
    targetPath?: string
  ) {
    this.items.push({
      level: 'error',
      category: 'error',
      targetType,
      reasonCode,
      reason,
      targetName,
      targetPath,
    })
  }

  private result(mangas: DiscoveredManga[], template: ScanTemplateInfo): ScanDiscoveryResult {
    const errors = this.items.filter((item) => item.level === 'error').length
    const warnings = this.items.filter((item) => item.level === 'warning').length
    const skipped = this.items.filter((item) => item.category === 'skipped').length

    return {
      ok: errors === 0,
      summary: {
        mangaFound: mangas.length,
        chapterFound: mangas.reduce((sum, manga) => sum + manga.chapters.length, 0),
        skipped,
        warnings,
        errors,
      },
      template,
      templateCandidates: this.templateCandidates,
      metadataSummary: this.metadataSummary(mangas),
      mangas,
      samples: [],
      items: this.items,
    }
  }
}
