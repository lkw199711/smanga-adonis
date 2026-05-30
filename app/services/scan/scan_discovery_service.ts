import * as fs from 'fs'
import * as path from 'path'
import { is_img } from '#utils/index'
import type {
  DiscoveredChapter,
  DiscoveredManga,
  ScanDiscoveryInput,
  ScanDiscoveryResult,
  ScanReportItem,
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

export default class ScanDiscoveryService {
  private items: ScanReportItem[] = []
  private input!: ScanDiscoveryInput

  discoverPath(input: ScanDiscoveryInput): ScanDiscoveryResult {
    this.input = input
    this.items = []

    const pathContent = input.pathContent
    const sampleLimit = input.sampleLimit ?? 5

    if (!pathContent) {
      this.error('path', 'PATH_EMPTY', '扫描路径不能为空', undefined, pathContent)
      return this.result([])
    }

    if (!fs.existsSync(pathContent)) {
      this.error('path', 'PATH_NOT_EXISTS', '路径不存在', undefined, pathContent)
      return this.result([])
    }

    if (!this.safeStat(pathContent)?.isDirectory()) {
      this.error('path', 'PATH_NOT_DIRECTORY', '扫描路径不是目录', undefined, pathContent)
      return this.result([])
    }

    const includeValid = this.validateRule(input.include, 'include')
    const excludeValid = this.validateRule(input.exclude, 'exclude')
    if (!includeValid || !excludeValid) {
      return this.result([])
    }

    const mangas =
      input.directoryFormat === 1
        ? this.discoverMangasFromParent(pathContent)
        : this.discoverMangasInDirectory(pathContent)

    this.addStructureWarnings(pathContent, mangas)

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
        },
      })
    }

    return {
      ...this.result(mangas),
      samples: mangas.slice(0, sampleLimit),
    }
  }

  private discoverMangasFromParent(dir: string) {
    const mangas: DiscoveredManga[] = []
    const entries = this.safeReadDir(dir, 'path')

    for (const entry of entries) {
      if (this.shouldSkipHidden(entry, path.join(dir, entry))) continue

      const entryPath = path.join(dir, entry)
      const stat = this.safeStat(entryPath)
      if (!stat) continue

      if (!stat.isDirectory()) {
        this.skip('file', 'DOUBLE_FOLDER_FILE', '双层目录模式下，根目录文件不会作为漫画扫描', entry, entryPath)
        continue
      }

      if (/smanga-info/.test(entry)) {
        this.skip('directory', 'SMANGA_META_DIR', '元数据目录不会作为分类目录扫描', entry, entryPath)
        continue
      }

      mangas.push(...this.discoverMangasInDirectory(entryPath))
    }

    return mangas
  }

  private discoverMangasInDirectory(dir: string) {
    const mangas: DiscoveredManga[] = []
    const entries = this.safeReadDir(dir, 'directory')

    for (const entry of entries) {
      const entryPath = path.join(dir, entry)
      if (this.shouldSkipHidden(entry, entryPath)) continue

      if (/smanga-info/.test(entry)) {
        this.skip('directory', 'SMANGA_META_DIR', '元数据目录不会作为漫画扫描', entry, entryPath)
        continue
      }

      const mangaType = this.resolveMangaType(entryPath)
      if (mangaType === 'other') {
        this.skip('file', 'UNSUPPORTED_MANGA_FILE', '不支持的文件类型不会作为漫画扫描', entry, entryPath)
        continue
      }

      const manga: DiscoveredManga = {
        mangaPath: entryPath,
        mangaName: entry,
        mangaType,
        parentPath: dir,
        chapters: [],
      }

      if (!this.shouldIncludeManga(manga)) continue

      manga.chapters =
        this.input.mediaType === 1
          ? [
              {
                chapterName: manga.mangaName,
                chapterPath: manga.mangaPath,
                fileName: manga.mangaName,
                chapterType: manga.mangaType,
              },
            ]
          : this.discoverChapters(manga)

      mangas.push(manga)
    }

    return mangas
  }

  private discoverChapters(manga: DiscoveredManga) {
    const stat = this.safeStat(manga.mangaPath)
    if (!stat?.isDirectory()) {
      this.skip('manga', 'MANGA_FILE_IN_SERIAL_MEDIA', '普通连载库中，压缩包/文件不会展开为章节', manga.mangaName, manga.mangaPath)
      return []
    }

    const chapters: DiscoveredChapter[] = []
    const entries = this.safeReadDir(manga.mangaPath, 'manga')

    for (const entry of entries) {
      const entryPath = path.join(manga.mangaPath, entry)
      if (this.shouldSkipHidden(entry, entryPath)) continue

      const stat = this.safeStat(entryPath)
      if (!stat) continue

      if (stat.isDirectory()) {
        const images = this.safeReadDir(entryPath, 'chapter').filter((file) =>
          is_img(path.join(entryPath, file))
        )
        const subDirs = this.safeReadDir(entryPath, 'chapter').filter((file) =>
          this.safeStat(path.join(entryPath, file))?.isDirectory()
        )
        if (!images.length && subDirs.length) {
          this.items.push({
            level: 'warning',
            category: 'warning',
            targetType: 'chapter',
            reasonCode: 'NESTED_CHAPTER_DIRECTORY',
            reason: '章节目录下还有子目录，当前版本会把这一层当章节，不会继续合并更深层级',
            targetName: entry,
            targetPath: entryPath,
            extra: { subDirectoryCount: subDirs.length },
          })
        }

        chapters.push({
          chapterName: entry,
          chapterPath: entryPath,
          fileName: entry,
          chapterType: 'img',
        })
        continue
      }

      const ext = path.extname(entry).toLowerCase()
      const chapterType = COMPRESS_EXTENSIONS[ext]
      if (!chapterType) {
        if (is_img(entryPath)) {
          this.skip('file', 'IMAGE_IN_MANGA_ROOT', '普通连载库中，漫画根目录图片不会直接作为章节', entry, entryPath)
        } else {
          this.skip('file', 'UNSUPPORTED_CHAPTER_FILE', '不支持的文件类型不会作为章节扫描', entry, entryPath)
        }
        continue
      }

      chapters.push({
        chapterName: path.basename(entry, path.extname(entry)),
        chapterPath: entryPath,
        fileName: entry,
        chapterType,
      })
    }

    return chapters
  }

  private resolveMangaType(filePath: string) {
    const stat = this.safeStat(filePath)
    if (stat?.isDirectory()) return 'img'

    const ext = path.extname(filePath).toLowerCase()
    return COMPRESS_EXTENSIONS[ext] || 'other'
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

  private addStructureWarnings(pathContent: string, mangas: DiscoveredManga[]) {
    if (!mangas.length) {
      this.items.push({
        level: 'warning',
        category: 'warning',
        targetType: 'path',
        reasonCode: 'NO_MANGA_FOUND',
        reason: '按当前媒体库类型和目录规则没有识别到漫画',
        targetPath: pathContent,
      })
      return
    }

    const serialWithDirectImages =
      this.input.mediaType === 0 &&
      mangas.filter((manga) => manga.chapters.length === 0 && this.hasDirectImages(manga.mangaPath)).length

    if (serialWithDirectImages) {
      this.items.push({
        level: 'warning',
        category: 'warning',
        targetType: 'path',
        reasonCode: 'MEDIA_TYPE_MISMATCH',
        reason: '检测到漫画目录下直接放置图片，当前普通连载库可能应改为单本库',
        targetPath: pathContent,
        extra: { mangaCount: serialWithDirectImages },
      })
    }

    const singleWithChapterDirs =
      this.input.mediaType === 1 &&
      mangas.filter((manga) => this.safeStat(manga.mangaPath)?.isDirectory() && this.hasChildDirectories(manga.mangaPath)).length

    if (singleWithChapterDirs) {
      this.items.push({
        level: 'warning',
        category: 'warning',
        targetType: 'path',
        reasonCode: 'MEDIA_TYPE_MISMATCH',
        reason: '检测到漫画目录下还有章节目录，当前单本库可能应改为普通连载库',
        targetPath: pathContent,
        extra: { mangaCount: singleWithChapterDirs },
      })
    }
  }

  private hasDirectImages(dir: string) {
    if (!this.safeStat(dir)?.isDirectory()) return false
    return this.safeReadDir(dir, 'manga').some((entry) => is_img(path.join(dir, entry)))
  }

  private hasChildDirectories(dir: string) {
    if (!this.safeStat(dir)?.isDirectory()) return false
    return this.safeReadDir(dir, 'manga').some((entry) => this.safeStat(path.join(dir, entry))?.isDirectory())
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
      this.items.push({
        level: 'error',
        category: 'error',
        targetType,
        reasonCode: 'READ_DIR_FAILED',
        reason: e?.message || '目录读取失败',
        targetPath: dir,
      })
      return []
    }
  }

  private safeStat(filePath: string) {
    try {
      return fs.statSync(filePath)
    } catch (e: any) {
      this.items.push({
        level: 'warning',
        category: 'warning',
        targetType: 'file',
        reasonCode: 'STAT_FAILED',
        reason: e?.message || '文件状态读取失败',
        targetPath: filePath,
      })
      return null
    }
  }

  private shouldSkipHidden(name: string, filePath: string) {
    if (name === '.' || name === '..') return true
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

  private result(mangas: DiscoveredManga[]): ScanDiscoveryResult {
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
      mangas,
      samples: [],
      items: this.items,
    }
  }
}
