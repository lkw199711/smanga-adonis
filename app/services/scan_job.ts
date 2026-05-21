import prisma from '#start/prisma'
import { TaskPriority } from '../type/index.js'
import * as fs from 'fs'
import * as path from 'path'
import { addTask } from './queue_service.js'
import { get_config } from '#utils/index'

type mangaItem = {
  mangaPath: string
  mangaName: string
  mangaType: string
  parentPath: string
}

export default class ScanPathJob {
  private pathId: number = 0
  // 路径信息
  private pathInfo: any = null
  // 媒体库信息
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
    this.pathInfo = await prisma.path.findFirst({
      where: { pathId: this.pathId },
      include: {
        media: true,
      },
    })

    this.mediaInfo = this.pathInfo?.media

    // 不存在路径 结束扫面任务
    if (!this.pathInfo || !this.mediaInfo) {
      console.log('不存在路径或媒体库');
      return
    }

    // 目录中的漫画
    let mangaList: mangaItem[] = []
    // 数据库中的漫画
    let mangaListSql = []

    // 根据否扫描二级目录的设置 执行扫描任务
    if (this.mediaInfo.directoryFormat === 1) {
      // 扫描所有目录
      mangaList = await this.scan_path_parent()
    } else {
      // 扫描目录下的所有文件
      mangaList = await this.scan_path(this.pathInfo.pathContent)
    }

    mangaListSql = await prisma.manga.findMany({ where: { pathId: this.pathId } })
    const delMangaList = mangaListSql.filter((manga) => {
      return !mangaList.some((item) => {
        return this.normalize_scan_path(item.mangaPath) === this.normalize_scan_path(manga.mangaPath)
      })
    })

    // 删除目录中不存在的漫画
    for (let index = 0; index < delMangaList.length; index++) {
      const item = delMangaList[index]
      // 生成参数
      const args = {
        pathId: this.pathId,
        mangaId: item.mangaId
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
      // 漫画目录为空，仍需清理数据库中已不存在的漫画。
      return
    }

    // 扫描现有目录漫画
    for (let index = 0; index < mangaList.length; index++) {
      const item = mangaList[index];
      // 生成参数
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

    // 生成媒体库封面
    if(get_config().scan?.createMediaPoster) {
      await addTask({
        taskName: `create_media_poster_${this.pathInfo.mediaId}`,
        command: 'createMediaPoster',
        args: { mediaId: this.pathInfo.mediaId },
        priority: TaskPriority.createMediaPoster,
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
      if( item === '.' || item === '..') {
        return false
      }
      // 隐藏文件夹
      if(this.ignoreHiddenFiles && /^\./.test(item)) {
        return false
      }

      return true
    })

    mangaList = folderList.map((item: any) => {
      const itemPath = path.join(dir, item)

      let mangaType = 'img'
      // 检查是否为文件夹
      if (!fs.statSync(itemPath).isDirectory()) {
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
    let folderList = fs.readdirSync(this.pathInfo.pathContent)

    folderList = folderList.filter((item) => {
      if( item === '.' || item === '..') {
        return false
      }

      // 隐藏文件夹
      if (this.ignoreHiddenFiles && /^\./.test(item)) {
        return false
      }

      const itemPath = path.join(this.pathInfo.pathContent, item)

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
      const itemPath = path.join(this.pathInfo.pathContent, item)
      mangaList = mangaList.concat(this.scan_path(itemPath))
    })

    return mangaList
  }
}


