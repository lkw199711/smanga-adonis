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

    if (!mangaList.length) {
      // 漫画目录为空 无需扫描
      return
    }

    mangaListSql = await prisma.manga.findMany({ where: { pathId: this.pathId } })
    const delMangaList = mangaListSql.filter((manga) => {
      return !mangaList.some((item) => {
        return item.mangaName === manga.mangaName
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

      addTask({
        taskName: `delete_manga_${item.mangaId}`,
        command: 'deleteManga',
        args,
        priority: TaskPriority.deleteManga,
        timeout: 1000 * 60 * 5,
      })
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

      addTask({
        taskName: `scan_path_${this.pathId}`,
        command: 'taskScanManga',
        args,
        priority: TaskPriority.scanManga,
        timeout: 1000 * 60 * 5,
      })
    }

    // 生产媒体库封面
    await addTask({
      taskName: `create_media_poster_${this.pathInfo.mediaId}`,
      command: 'createMediaPoster',
      args: { mediaId: this.pathInfo.mediaId },
      priority: TaskPriority.createMediaPoster,
    })
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
    mangaList = mangaList.filter((item) => {
      // 排除元数据文件夹
      if (/smanga-info/.test(item.mangaName)) {
        return false
      }

      // 非漫画文件夹
      if (item.mangaType === 'other') {
        return false
      }

      // 包含匹配
      if (this.pathInfo.include) {
        return new RegExp(this.pathInfo.include).test(item.mangaName)
      }

      // 排除匹配
      if (this.pathInfo.exclude) {
        return !new RegExp(this.pathInfo.exclude).test(item.mangaName)
      }

      return true
    })

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

      // 包含匹配
      if (this.pathInfo.include) {
        return new RegExp(this.pathInfo.include).test(itemPath)
      }

      // 排除匹配
      if (this.pathInfo.exclude) {
        return !new RegExp(this.pathInfo.exclude).test(itemPath)
      }

      return true
    })

    folderList.map((item) => {
      // 二级目录扫描
      const itemPath = path.join(this.pathInfo.pathContent, item)
      mangaList = mangaList.concat(this.scan_path(itemPath))
    })

    return mangaList
  }
}


