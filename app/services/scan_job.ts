import prisma from '#start/prisma'
import { TaskPriority } from '../type/index.js'
import * as fs from 'fs'
import * as path from 'path'
import { addTask } from './queue_service.js'
import { get_config } from '#utils/index'
import log from '#services/log_service'

type mangaItem = {
  mangaPath: string
  mangaName: string
  mangaType: string
  parentPath: string
}

export default class ScanPathJob {
  private pathId: number = 0
  private pathInfo: any = null
  private mediaInfo: any = null
  private ignoreHiddenFiles: boolean

  constructor({ pathId }: { pathId: number }) {
    this.pathId = pathId
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
    } catch (error: any) {
      throw new Error(`scan rule invalid for path ${this.pathId}: ${rule} (${error?.message || error})`)
    }
  }

  private should_include_manga(item: mangaItem) {
    if (/smanga-info/.test(item.mangaName)) return false
    if (item.mangaType === 'other') return false

    const target = `${item.mangaName}\n${item.mangaPath}`

    if (this.pathInfo.include) {
      return this.match_rule(this.pathInfo.include, target)
    }

    if (this.pathInfo.exclude) {
      return !this.match_rule(this.pathInfo.exclude, target)
    }

    return true
  }

  async run() {
    await log.info({
      type: 'scan',
      module: 'scan',
      action: 'path.run.started',
      message: `scan path ${this.pathId} started`,
      context: { pathId: this.pathId },
    })

    this.pathInfo = await prisma.path.findFirst({
      where: { pathId: this.pathId },
      include: { media: true },
    })

    this.mediaInfo = this.pathInfo?.media

    if (!this.pathInfo || !this.mediaInfo) {
      await log.warn({
        type: 'scan',
        module: 'scan',
        action: 'path.run.skipped',
        message: `scan path ${this.pathId} skipped: path or media missing`,
        context: {
          pathId: this.pathId,
          hasPath: !!this.pathInfo,
          hasMedia: !!this.mediaInfo,
        },
      })
      return
    }

    let mangaList: mangaItem[] = []

    if (this.mediaInfo.directoryFormat === 1) {
      mangaList = await this.scan_path_parent()
    } else {
      mangaList = await this.scan_path(this.pathInfo.pathContent)
    }

    const mangaListSql = await prisma.manga.findMany({ where: { pathId: this.pathId } })
    const delMangaList = mangaListSql.filter((manga) => {
      return !mangaList.some((item) => {
        return this.normalize_scan_path(item.mangaPath) === this.normalize_scan_path(manga.mangaPath)
      })
    })

    for (let index = 0; index < delMangaList.length; index++) {
      const item = delMangaList[index]
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

    if (!mangaList.length) {
      await log.info({
        type: 'scan',
        module: 'scan',
        action: 'path.run.completed',
        message: `scan path ${this.pathId} completed with no manga`,
        context: {
          pathId: this.pathId,
          discoveredCount: 0,
          deleteMangaCount: delMangaList.length,
        },
      })
      return
    }

    for (let index = 0; index < mangaList.length; index++) {
      const item = mangaList[index]
      const args = {
        pathId: this.pathId,
        mangaCount: mangaList.length,
        mangaIndex: index,
        isCloudMedia: this.mediaInfo.isCloudMedia,
        ...item,
      }

      await addTask({
        taskName: `scan_path_${this.pathId}`,
        command: 'taskScanManga',
        args,
        priority: TaskPriority.scanManga,
        timeout: 1000 * 60 * 5,
      })
    }

    if (get_config().scan?.createMediaPoster) {
      await addTask({
        taskName: `create_media_poster_${this.pathInfo.mediaId}`,
        command: 'createMediaPoster',
        args: { mediaId: this.pathInfo.mediaId },
        priority: TaskPriority.createMediaPoster,
      })
    }

    await log.info({
      type: 'scan',
      module: 'scan',
      action: 'path.run.completed',
      message: `scan path ${this.pathId} completed`,
      context: {
        pathId: this.pathId,
        discoveredCount: mangaList.length,
        deleteMangaCount: delMangaList.length,
        mediaId: this.pathInfo.mediaId,
        directoryFormat: this.mediaInfo.directoryFormat,
      },
    })
  }

  scan_path(dir: string) {
    let folderList = fs.readdirSync(dir)
    let mangaList: mangaItem[] = []

    folderList = folderList.filter((item) => {
      if (item === '.' || item === '..') return false
      if (this.ignoreHiddenFiles && /^\./.test(item)) return false
      return true
    })

    mangaList = folderList.map((item: any) => {
      const itemPath = path.join(dir, item)

      let mangaType = 'img'
      if (!fs.statSync(itemPath).isDirectory()) {
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
      }
    })

    mangaList = mangaList.filter((item) => this.should_include_manga(item))

    return mangaList
  }

  scan_path_parent() {
    let mangaList: mangaItem[] = []
    let folderList = fs.readdirSync(this.pathInfo.pathContent)

    folderList = folderList.filter((item) => {
      if (item === '.' || item === '..') return false
      if (this.ignoreHiddenFiles && /^\./.test(item)) return false

      const itemPath = path.join(this.pathInfo.pathContent, item)
      if (!fs.statSync(itemPath).isDirectory()) return false
      if (/smanga-info/.test(itemPath)) return false

      return true
    })

    folderList.forEach((item) => {
      const itemPath = path.join(this.pathInfo.pathContent, item)
      mangaList = mangaList.concat(this.scan_path(itemPath))
    })

    return mangaList
  }
}