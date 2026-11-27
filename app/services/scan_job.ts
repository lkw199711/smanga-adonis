import prisma from '#start/prisma'
import { TaskPriority } from '../type/index.js'
import * as fs from 'fs'
import * as path from 'path'
import { addTask } from './queue_service.js'
import { get_config } from '#utils/index'
import ScanDiscoveryService from './scan/scan_discovery_service.js'
import ScanReportService from './scan/scan_report_service.js'
import { resolveScanEngine } from './scan/scan_config_service.js'
import {
  canReuseMangaScan,
  mangaScanInput,
  scanConfigKey,
  scanPathKey,
  sourceFingerprint,
} from './scan/scan_incremental_service.js'
import type { DiscoveredManga, ReusableMangaScan, ScanDiscoverySummary, ScanReportItem } from './scan/scan_types.js'
import { LibraryPathContext } from './library_path_service.js'
import DeleteMangaJob from './delete_manga_job.js'

type mangaItem = Omit<DiscoveredManga, 'chapters'> & { chapters?: DiscoveredManga['chapters'] }

export default class ScanPathJob {
  private pathId: number = 0
  // 路径信息
  private pathInfo: any = null
  // 媒体库信息
  private mediaInfo: any = null
  private ignoreHiddenFiles: boolean
  private scanRunId?: number
  private rebuild: boolean
  private discoveryService = new ScanDiscoveryService()
  private reportService = new ScanReportService()
  private libraryPath = new LibraryPathContext()

  constructor({ pathId, scanRunId, rebuild = false }: {
    pathId: number
    scanRunId?: number
    rebuild?: boolean
  }) {
    this.pathId = pathId
    this.scanRunId = scanRunId
    this.rebuild = rebuild
    const config = get_config()
    this.ignoreHiddenFiles = config.scan?.ignoreHiddenFiles === 1
  }

  private normalize_scan_path(filePath: string | null | undefined) {
    return filePath ? path.normalize(filePath) : ''
  }

  private match_rule(rule: string | null | undefined, target: string) {
    if (!rule) return false

    try {
      return new RegExp(rule).test(target)
    } catch (e: any) {
      throw new Error(`路径 ${this.pathId} 的扫描匹配规则无效: ${rule} (${e?.message || e})`)
    }
  }

  private should_include_manga(item: mangaItem) {
    // 排除元数据文件夹
    if (/smanga-info/.test(item.mangaName)) {
      return false
    }

    // 非漫画文件夹
    if (item.mangaType === 'other') {
      return false
    }

    // 同时匹配漫画名与完整路径，双层目录时可以用上层目录做规则。
    const target = `${item.mangaName}\n${item.mangaPath}`

    // 包含匹配
    if (this.pathInfo.include) {
      return this.match_rule(this.pathInfo.include, target)
    }

    // 排除匹配
    if (this.pathInfo.exclude) {
      return !this.match_rule(this.pathInfo.exclude, target)
    }

    return true
  }

  async run() {
    await this.reportService.markRunning(this.scanRunId)

    this.pathInfo = await prisma.path.findFirst({
      where: { pathId: this.pathId },
      include: {
        media: true,
        storageRoot: true,
      },
    })

    this.mediaInfo = this.pathInfo?.media

    // 不存在路径 结束扫面任务
    if (!this.pathInfo || this.pathInfo.deleteFlag === 1 || !this.mediaInfo) {
      console.log('不存在路径或媒体库')
      await this.reportService.finishFailed(this.scanRunId, '路径或媒体库不存在')
      return
    }
    let physicalPathContent: string
    try {
      this.libraryPath = new LibraryPathContext(this.pathInfo)
      physicalPathContent = this.libraryPath.scanDirectory(this.pathInfo.pathContent)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.reportService.finishFailed(this.scanRunId, message)
      return
    }

    // 目录中的漫画
    let mangaList: mangaItem[] = []
    let discoverySummary: ScanDiscoverySummary | null = null
    const scanEngine = resolveScanEngine()
    const input = mangaScanInput(
      physicalPathContent, this.pathInfo, this.mediaInfo, scanEngine, this.ignoreHiddenFiles
    )
    const scanKey = scanConfigKey([input, this.pathInfo.storageRootId])
    const now = new Date()
    const mangaListSql = await prisma.manga.findMany({
      where: { pathId: this.pathId },
      select: { mangaId: true, mangaName: true, mangaPath: true, deleteFlag: true, scanState: true },
    })
    const completedMangaPaths = await this.reportService.mangaOutcomePaths(this.scanRunId)
    const reusableMangas = new Map<string, ReusableMangaScan>()
    // The original v1 auto detector ranks layouts against the whole source on each scan.
    const requiresFullDiscovery = scanEngine === 'template-v1' && input.scanTemplateKey === 'auto'
    if (!this.rebuild && !requiresFullDiscovery && !get_config().scan?.reloadCover) {
      for (const manga of mangaListSql) {
        if (manga.deleteFlag || completedMangaPaths.has(manga.mangaPath) || !manga.scanState ||
            !canReuseMangaScan(manga.scanState, scanKey, now)) continue
        reusableMangas.set(scanPathKey(this.libraryPath.resolve(manga.mangaPath)), manga.scanState)
      }
    }

    const shouldUseTemplateDiscovery = scanEngine !== 'legacy'
    if (shouldUseTemplateDiscovery) {
      const discovery = this.discoveryService.discoverPath({
        ...input,
        reusableMangas,
      })

      await this.reportService.appendItems(this.scanRunId, discovery.items)
      discoverySummary = discovery.summary

      if (!discovery.ok || !discovery.filesystemComplete) {
        await this.reportService.finishFailed(
          this.scanRunId,
          '扫描预检失败，未进入正式扫描',
          discovery.summary
        )
        return
      }

      mangaList = discovery.mangas
    } else {
      // 根据否扫描二级目录的设置 执行扫描任务
      if (this.mediaInfo.directoryFormat === 1) {
        // 扫描所有目录
        mangaList = await this.scan_path_parent()
      } else {
        // 扫描目录下的所有文件
        mangaList = await this.scan_path(physicalPathContent)
      }
      for (const item of mangaList) {
        const cached = reusableMangas.get(scanPathKey(item.mangaPath))
        if (cached && cached.fingerprint === item.fingerprint) {
          item.reusedChapterCount = cached.chapterCount
        }
      }
    }

    if (this.libraryPath.usesStorageRoot && !mangaList.length && mangaListSql.length) {
      await this.reportService.finishFailed(
        this.scanRunId,
        '扫描结果为空，无法确认挂载是否就绪，已保留现有漫画',
        discoverySummary ?? undefined
      )
      return
    }

    await prisma.path.update({ where: { pathId: this.pathId }, data: { lastScanTime: now } })

    const discoveredMangas = mangaList.map(item => ({
      ...item,
      mangaPath: this.libraryPath.toStored(item.mangaPath),
      parentPath: this.libraryPath.toStored(item.parentPath),
      chapters: item.chapters?.map(chapter => ({
        ...chapter,
        chapterPath: this.libraryPath.toStored(chapter.chapterPath),
      })),
    }))
    const queuedMangas = discoveredMangas.filter(item => item.reusedChapterCount === undefined)
    const scannedPaths = new Set(discoveredMangas.map(item => this.normalize_scan_path(item.mangaPath)))
    const savedPaths = new Set(mangaListSql.map(item => this.normalize_scan_path(item.mangaPath)))
    const delMangaList = mangaListSql.filter(item =>
      this.rebuild || !scannedPaths.has(this.normalize_scan_path(item.mangaPath))
    )

    const reportItems: ScanReportItem[] = []
    const newMangaList = discoveredMangas.filter(item =>
      this.rebuild || !savedPaths.has(this.normalize_scan_path(item.mangaPath))
    )
    for (const item of newMangaList) {
      reportItems.push({
        level: 'info',
        category: 'change',
        targetType: 'manga',
        action: 'create',
        targetName: item.mangaName,
        targetPath: item.mangaPath,
      })
    }
    for (const item of delMangaList) {
      reportItems.push({
        level: 'warning',
        category: 'change',
        targetType: 'manga',
        action: 'delete',
        reasonCode: this.rebuild ? 'MANGA_RESCAN_REBUILD' : 'MANGA_NOT_FOUND_ON_DISK',
        reason: this.rebuild ? '完整重扫将重新创建漫画记录' : '数据库中存在，但本次扫描未在目录中发现',
        targetName: item.mangaName,
        targetPath: item.mangaPath,
      })
    }
    await this.reportService.appendItems(this.scanRunId, reportItems)

    // 删除目录中不存在的漫画
    for (let index = 0; index < delMangaList.length; index++) {
      const item = delMangaList[index]
      if (this.rebuild) {
        await new DeleteMangaJob({ mangaId: item.mangaId }).run()
        continue
      }
      // 生成参数
      const args = {
        pathId: this.pathId,
        mangaId: item.mangaId,
      }

      await addTask({
        taskName: `delete_manga_${item.mangaId}`,
        command: 'deleteManga',
        args,
        priority: TaskPriority.deleteManga,
        timeout: 1000 * 60 * 5,
      })
    }

    const summary = {
      ...discoverySummary,
      mangaFound: mangaList.length,
      queuedManga: queuedMangas.length,
      unchangedManga: mangaList.length - queuedMangas.length,
      deletedManga: delMangaList.length,
    }
    const expectedTasks = queuedMangas.filter(item => !completedMangaPaths.has(item.mangaPath)).length +
      completedMangaPaths.size
    await this.reportService.setExpectedTasks(this.scanRunId, expectedTasks)
    if (!expectedTasks && !delMangaList.length) {
      await this.reportService.finishSuccess(
        this.scanRunId,
        summary,
        mangaList.length ? '扫描完成，漫画无变化' : '扫描发现完成，未识别到漫画'
      )
      return
    }

    // 扫描现有目录漫画
    for (const item of queuedMangas) {
      if (completedMangaPaths.has(item.mangaPath)) continue
      // 生成参数
      const args = {
        pathId: this.pathId,
        isCloudMedia: this.mediaInfo.isCloudMedia,
        mangaPath: item.mangaPath,
        mangaName: item.mangaName,
        parentPath: item.parentPath,
        chapters: item.chapters,
        forceChapterScan: true,
        scanState: item.fingerprint && {
          scanKey,
          fingerprint: item.fingerprint,
          templatePattern: item.scanTemplatePattern ?? null,
          score: item.scanScore ?? 0,
          checkedAt: now.toISOString(),
        },
      }

      await addTask({
        taskName: `scan_path_${this.pathId}_run_${this.scanRunId || 'legacy'}_manga_${scanConfigKey([item.mangaPath]).slice(0, 24)}`,
        command: 'taskScanManga',
        args: { ...args, scanRunId: this.scanRunId },
        priority: TaskPriority.scanManga,
        timeout: 1000 * 60 * 5,
      })
    }

    // 生成媒体库封面
    if (get_config().scan?.createMediaPoster) {
      await addTask({
        taskName: `create_media_poster_${this.pathInfo.mediaId}`,
        command: 'createMediaPoster',
        args: { mediaId: this.pathInfo.mediaId },
        priority: TaskPriority.createMediaPoster,
      })
    }

    // 扫描完成后自动触发 P2P announce,更新共享信息中的 mangaCount
    await addTask({
      taskName: `announce_after_scan_${this.pathInfo.mediaId}`,
      command: 'announceAfterScan',
      args: { mediaId: this.pathInfo.mediaId },
      priority: TaskPriority.announceP2P,
    })

    const normalizedPath = this.normalize_scan_path(physicalPathContent)
    const pathShares = await prisma.p2p_local_share.findMany({
      where: {
        enable: 1,
        sharePath: { not: null },
      },
      select: {
        p2pGroupId: true,
        sharePath: true,
      },
    })
    const matchedGroupIds = [
      ...new Set(
        pathShares
          .filter((share: { p2pGroupId: number; sharePath: string | null }) => {
            const sharePath = this.normalize_scan_path(share.sharePath)
            return (
              sharePath === normalizedPath || sharePath.startsWith(`${normalizedPath}${path.sep}`)
            )
          })
          .map((share: { p2pGroupId: number }) => share.p2pGroupId)
      ),
    ]

    if (matchedGroupIds.length) {
      const groups = await prisma.p2p_group.findMany({
        where: { p2pGroupId: { in: matchedGroupIds } },
        select: { groupNo: true },
      })
      for (const group of groups) {
        await addTask({
          taskName: `announce_after_scan_group_${group.groupNo}_${this.pathId}`,
          command: 'announceAfterScan',
          args: { groupNo: group.groupNo },
          priority: TaskPriority.announceP2P,
        })
      }
    }

    if (this.scanRunId) {
      await addTask({
        taskName: `scan_path_${this.pathId}_run_${this.scanRunId}_finalize`,
        command: 'finalizeScanRun',
        args: {
          scanRunId: this.scanRunId,
          expectedTasks,
          summary,
        },
        priority: TaskPriority.finalizeScan,
        timeout: 11 * 60 * 1000,
      })
    }
  }

  /**
   * 扫描目录
   * @param dir
   * @returns
   */
  scan_path(dir: string) {
    let folderList = fs.readdirSync(dir)
    let mangaList = []

    // 在列表中去除. .. 文件夹
    folderList = folderList.filter((item) => {
      if (item === '.' || item === '..') {
        return false
      }
      // 隐藏文件夹
      if (this.ignoreHiddenFiles && /^\./.test(item)) {
        return false
      }

      return true
    })

    mangaList = folderList.map((item: any) => {
      const itemPath = path.join(dir, item)
      const stat = fs.statSync(itemPath)

      let mangaType = 'img'
      // 检查是否为文件夹
      if (!stat.isDirectory()) {
        // 获取文件扩展名
        const ext = path.extname(item).toLowerCase()
        if (['.zip', '.cbz', '.cbr', '.epub'].includes(ext)) {
          mangaType = 'zip'
        } else if (ext === '.rar') {
          mangaType = 'rar'
        } else if (ext === '.7z') {
          mangaType = '7z'
        } else if (ext === '.pdf') {
          mangaType = 'pdf'
        } else {
          mangaType = 'other'
        }
      }

      return {
        mangaPath: itemPath,
        mangaName: item,
        mangaType,
        parentPath: dir,
        fingerprint: sourceFingerprint(stat),
      }
    })

    // 根据正则规则过滤出漫画目录
    mangaList = mangaList.filter((item) => this.should_include_manga(item))

    return mangaList
  }

  /**
   * 扫描二级目录
   * @returns 漫画列表平铺
   */
  scan_path_parent() {
    let mangaList: mangaItem[] = []
    const physicalPathContent = this.libraryPath.resolve(this.pathInfo.pathContent)
    let folderList = fs.readdirSync(physicalPathContent)

    folderList = folderList.filter((item) => {
      if (item === '.' || item === '..') {
        return false
      }

      // 隐藏文件夹
      if (this.ignoreHiddenFiles && /^\./.test(item)) {
        return false
      }

      const itemPath = path.join(physicalPathContent, item)

      // 检查是否为文件夹
      if (!fs.statSync(itemPath).isDirectory()) {
        return false
      }

      // 排除元数据文件夹
      if (/smanga-info/.test(itemPath)) {
        return false
      }

      return true
    })

    folderList.forEach((item) => {
      // 二级目录扫描
      const itemPath = path.join(physicalPathContent, item)
      mangaList = mangaList.concat(this.scan_path(itemPath))
    })

    return mangaList
  }
}
