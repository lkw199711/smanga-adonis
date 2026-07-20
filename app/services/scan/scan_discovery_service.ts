import * as fs from 'fs'
import * as path from 'path'
import { is_img } from '#utils/index'
import {
  listConcreteScanTemplates,
  normalizeMetadataProfile,
  resolveScanTemplate,
} from './scan_template_service.js'
import {
  parseScanTemplateConfig,
  resolveScanEngine,
  ScanConfigError,
} from './scan_config_service.js'
import type {
  DiscoveredChapter,
  DiscoveredManga,
  ScanDiscoveryInput,
  ScanDiscoveryResult,
  ScanMetadataSummary,
  ScanReportItem,
  ScanTemplateCandidate,
  ScanTemplateInfo,
  ScanTemplateRuleConfig,
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
  private activeRule: ScanTemplateRuleConfig | null = null
  private readDirCache = new Map<string, string[]>()
  private statCache = new Map<string, fs.Stats | null>()
  private directImageCache = new Map<string, boolean>()
  private childDirectoryCache = new Map<string, boolean>()

  discoverPath(input: ScanDiscoveryInput): ScanDiscoveryResult {
    this.input = input
    this.items = []
    this.templateCandidates = []
    this.activeRule = null
    this.readDirCache.clear()
    this.statCache.clear()
    this.directImageCache.clear()
    this.childDirectoryCache.clear()

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
    let template = resolvedTemplate
    let mangas: DiscoveredManga[]

    if (resolvedTemplate.key === 'custom') {
      let customConfig
      try {
        customConfig = parseScanTemplateConfig(input.scanTemplateConfig)
      } catch (error) {
        const message = error instanceof ScanConfigError ? error.message : '自定义扫描模板配置无效'
        this.error(
          'rule',
          'SCAN_TEMPLATE_CONFIG_INVALID',
          message,
          'scanTemplateConfig',
          pathContent
        )
        return this.result([], resolvedTemplate)
      }
      if (!customConfig) {
        this.error(
          'rule',
          'SCAN_TEMPLATE_CONFIG_REQUIRED',
          '选择自定义模板时必须提供 scanTemplateConfig'
        )
        return this.result([], resolvedTemplate)
      }

      const customTemplates = customConfig.rules.map((rule) => this.templateFromRule(rule))
      if (customConfig.strategy === 'single') {
        this.activeRule = customConfig.rules[0]
        template = customTemplates[0]
        mangas = this.discoverWithTemplate(pathContent, template)
      } else {
        mangas = this.discoverMixed(pathContent, customTemplates, customConfig.rules, false)
      }
    } else if (resolvedTemplate.key === 'auto') {
      if ((input.engine || resolveScanEngine()) === 'template-v1') {
        template = this.selectTemplate(pathContent)
        mangas = this.discoverWithTemplate(pathContent, template)
      } else {
        mangas = this.discoverMixed(pathContent, listConcreteScanTemplates(), [], true)
        const resolvedKeys = [...new Set(mangas.map((manga) => manga.scanTemplateKey))]
        if (resolvedKeys.length === 1) {
          template =
            listConcreteScanTemplates().find((candidate) => candidate.key === resolvedKeys[0]) ||
            resolvedTemplate
        }
      }
    } else {
      mangas = this.discoverWithTemplate(pathContent, template)
    }

    this.activeTemplate = template
    this.emitItems = true
    this.addStructureWarnings(pathContent, mangas, template)
    this.addFoundItems(mangas, template)

    return {
      ...this.result(mangas, template),
      samples: mangas.slice(0, sampleLimit),
    }
  }

  private templateFromRule(rule: ScanTemplateRuleConfig): ScanTemplateInfo {
    return {
      key: 'custom',
      label: rule.label,
      pattern: `custom:${rule.id}`,
      mangaIndex: rule.mangaIndex,
      chapterIndex: rule.chapterIndex,
      singleChapter: rule.singleChapter,
    }
  }

  private discoverMixed(
    root: string,
    templates: ScanTemplateInfo[],
    rules: ScanTemplateRuleConfig[],
    applyConfidenceThreshold: boolean
  ) {
    type RankedManga = {
      manga: DiscoveredManga
      template: ScanTemplateInfo
      score: number
      priority: number
    }
    const ranked: RankedManga[] = []

    this.templateCandidates = templates.map((template, index) => {
      this.emitItems = false
      this.activeRule = rules[index] || null
      const mangas = this.discoverWithTemplate(root, template)
      const score = this.scoreTemplate(template, mangas)
      for (const manga of mangas) {
        const mangaScore = this.scoreTemplate(template, [manga])
        if (!applyConfidenceThreshold || mangaScore >= 40) {
          ranked.push({
            manga,
            template,
            score: mangaScore,
            priority: rules[index]?.priority ?? 0,
          })
        }
      }
      return {
        key: template.key,
        label: template.label,
        pattern: template.pattern,
        mangaFound: mangas.length,
        chapterFound: mangas.reduce((sum, manga) => sum + manga.chapters.length, 0),
        score,
      }
    })

    this.templateCandidates.sort((a, b) => b.score - a.score)
    this.emitItems = true
    this.activeRule = null

    const byPath = new Map<string, RankedManga>()
    for (const candidate of ranked) {
      const normalized = path.normalize(candidate.manga.mangaPath)
      const existing = byPath.get(normalized)
      if (
        !existing ||
        candidate.score > existing.score ||
        (candidate.score === existing.score && candidate.priority > existing.priority)
      ) {
        byPath.set(normalized, candidate)
      }
    }

    const ordered = [...byPath.values()].sort((a, b) => {
      const depthA = path.relative(root, a.manga.mangaPath).split(path.sep).length
      const depthB = path.relative(root, b.manga.mangaPath).split(path.sep).length
      return b.score - a.score || b.priority - a.priority || depthA - depthB
    })
    const selected: RankedManga[] = []
    for (const candidate of ordered) {
      const candidatePath = path.normalize(candidate.manga.mangaPath)
      const overlaps = selected.some((other) => {
        const otherPath = path.normalize(other.manga.mangaPath)
        return (
          candidatePath.startsWith(`${otherPath}${path.sep}`) ||
          otherPath.startsWith(`${candidatePath}${path.sep}`)
        )
      })
      if (!overlaps) selected.push(candidate)
    }

    this.items.push({
      level: 'info',
      category: 'summary',
      targetType: 'path',
      action: 'none',
      reasonCode: applyConfidenceThreshold
        ? 'SCAN_TEMPLATE_MIXED_AUTO'
        : 'SCAN_TEMPLATE_CUSTOM_RULES',
      reason: applyConfidenceThreshold
        ? `已按目录分支自动组合 ${new Set(selected.map((item) => item.template.pattern)).size} 种扫描结构`
        : `已应用 ${templates.length} 条自定义扫描规则`,
      targetPath: root,
      extra: {
        templates: [...new Set(selected.map((item) => item.template.pattern))],
        candidates: this.templateCandidates,
      },
    })

    return selected.map((item) => item.manga)
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
          if (
            !this.looksLikeChapterName(chapter.chapterName) &&
            !this.looksLikeArchiveChapter(chapter.fileName)
          ) {
            score -= 12
          }
          if (
            this.templateHasIntermediateFolder(template) &&
            !this.chapterHasVolumeIntermediate(chapter.chapterName)
          ) {
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
      if (
        this.activeRule?.directoryInclude &&
        !new RegExp(this.activeRule.directoryInclude).test(candidate.entryPath)
      ) {
        continue
      }
      if (
        this.activeRule?.directoryExclude &&
        new RegExp(this.activeRule.directoryExclude).test(candidate.entryPath)
      ) {
        continue
      }
      if (this.isMetadataDirectory(candidate.name)) {
        this.skip(
          'directory',
          'METADATA_DIRECTORY',
          '元数据目录不会作为漫画扫描',
          candidate.name,
          candidate.entryPath
        )
        continue
      }

      const mangaType = this.resolveMangaType(candidate.entryPath)
      if (mangaType === 'other') {
        this.skip(
          'file',
          'UNSUPPORTED_MANGA_FILE',
          '不支持的文件类型不会作为漫画扫描',
          candidate.name,
          candidate.entryPath
        )
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
          this.skip(
            'manga',
            'NO_CHAPTER_FOUND',
            '按当前模板未在漫画下识别到章节',
            manga.mangaName,
            manga.mangaPath
          )
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
      this.skip(
        'manga',
        'NO_DIRECT_IMAGE',
        '单本模板要求漫画目录下直接包含图片',
        manga.mangaName,
        manga.mangaPath
      )
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
      this.skip(
        'manga',
        'MANGA_FILE_IN_SERIAL_TEMPLATE',
        '当前模板需要从漫画目录下继续识别章节',
        manga.mangaName,
        manga.mangaPath
      )
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
          this.skip(
            'file',
            'UNSUPPORTED_CHAPTER_FILE',
            '不支持的文件类型不会作为章节扫描',
            entry.name,
            entry.entryPath
          )
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
          scanTemplateKey: manga.scanTemplateKey || template.key,
          scanTemplatePattern:
            this.templateCandidates.find((candidate) => candidate.key === manga.scanTemplateKey)
              ?.pattern || template.pattern,
        },
      })
    }
  }

  private addStructureWarnings(
    pathContent: string,
    mangas: DiscoveredManga[],
    template: ScanTemplateInfo
  ) {
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

  private shouldIncludeManga(
    manga: Pick<DiscoveredManga, 'mangaName' | 'mangaPath' | 'mangaType'>
  ) {
    if (manga.mangaType === 'other') return false

    const target = `${manga.mangaName}\n${manga.mangaPath}`
    if (this.input.include && !new RegExp(this.input.include).test(target)) {
      this.skip(
        'manga',
        'INCLUDE_NOT_MATCHED',
        '未匹配 include 规则',
        manga.mangaName,
        manga.mangaPath
      )
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

        if (
          (profile === 'auto' || profile === 'series-json') &&
          fs.existsSync(path.join(manga.mangaPath, 'series.json'))
        ) {
          summary.seriesJson += 1
        }
      }

      if (profile === 'auto' || profile === 'comicinfo') {
        summary.comicInfoCandidate += manga.chapters.filter(
          (chapter) => chapter.chapterType === 'zip'
        ).length
      }
    }

    return summary
  }

  private hasDirectContentImages(dir: string) {
    if (this.directImageCache.has(dir)) return this.directImageCache.get(dir)!
    if (!this.safeStat(dir)?.isDirectory()) return false
    const result = this.safeReadDir(dir, 'directory').some((entry) => {
      const entryPath = path.join(dir, entry)
      return is_img(entryPath) && !this.isNonContentImage(entry)
    })
    this.directImageCache.set(dir, result)
    return result
  }

  private hasChildDirectories(dir: string) {
    if (this.childDirectoryCache.has(dir)) return this.childDirectoryCache.get(dir)!
    if (!this.safeStat(dir)?.isDirectory()) return false
    const result = this.safeReadDir(dir, 'directory').some((entry) =>
      this.safeStat(path.join(dir, entry))?.isDirectory()
    )
    this.childDirectoryCache.set(dir, result)
    return result
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
    const cached = this.readDirCache.get(dir)
    if (cached) return cached
    try {
      const entries = fs.readdirSync(dir)
      this.readDirCache.set(dir, entries)
      return entries
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
    if (this.statCache.has(filePath)) return this.statCache.get(filePath) || null
    try {
      const stat = fs.statSync(filePath)
      this.statCache.set(filePath, stat)
      return stat
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
      this.statCache.set(filePath, null)
      return null
    }
  }

  private shouldSkipEntry(name: string, filePath: string) {
    if (name === '.' || name === '..') return true

    if (this.isMetadataDirectory(name)) {
      this.skip(
        'directory',
        'METADATA_DIRECTORY',
        '元数据目录不会作为漫画或章节扫描',
        name,
        filePath
      )
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
