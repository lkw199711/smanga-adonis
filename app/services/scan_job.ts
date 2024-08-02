/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-23 18:34:07
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-07-30 19:33:18
 * @FilePath: \smanga-adonis\app\services\scan_job.ts
 */
import prisma from '#start/prisma'
import { Prisma, path as pathType, media as mediaType } from '@prisma/client'
import { TaskPriority } from '../../type/index.js'
import * as fs from 'fs'
import * as path from 'path'

type scanArgs = {
  pathId: number
  pathContent: string
  directoryFormat: number
  include: string
  exclude: string
}

type mangaItem = {
  mangaPath: string
  mangaName: string
  mangaType: string
  parentPath: string
}

// 路径信息
let pathInfo: any = null
// 媒体库信息
let mediaInfo: any = null

export default async function handle({ pathId }: any) {
  pathInfo = await prisma.path.findUnique({
    where: { pathId },
    include: {
      media: true,
    },
  })

  mediaInfo = pathInfo?.media

  // 不存在路径 结束扫面任务
  if (!pathInfo || !mediaInfo) return

  const scanRecord = await prisma.scan.findFirst({ where: { pathId } })

  if (scanRecord) {
    // 存在扫面任务 终止现在扫描
    return
  }

  // 记录最新扫描时间
  await prisma.path.update({ where: { pathId }, data: { lastScanTime: new Date() } })
  await prisma.scan.create({
    data: {
      pathId,
      scanStatus: 'start',
      pathContent: pathInfo.pathContent,
    },
  })

  // 目录中的漫画
  let mangaList: mangaItem[] = []
  // 数据库中的漫画
  let mangaListSql = []

  // 根据否扫描二级目录的设置 执行扫描任务
  if (mediaInfo.directoryFormat === 1) {
    // 扫描所有目录
    mangaList = await scan_path_parent()
  } else {
    // 扫描目录下的所有文件
    mangaList = await scan_path(pathInfo.pathContent)
  }

  if (!mangaList.length) {
    // 漫画目录为空 无需扫描
    return
  }

  mangaListSql = await prisma.manga.findMany({ where: { pathId } })

  if (mangaList.length < mangaListSql.length) {
    // 现存漫画少于库中漫画, 说明删除了文件. 不进行新增,只删除库中的记录
  } else {
    // 现存漫画多于库中漫画, 说明新增了文件. 进行新增 dev_log
    mangaList.forEach(async (item: mangaItem, index: number) => {
      await prisma.task.create({
        data: {
          taskName: `scan_${pathId}`,
          // 使任务按顺序执行
          priority: TaskPriority.scan_manga + index,
          command: 'task_scan_manga',
          args: {
            pathId,
            pathInfo,
            mediaInfo,
            mangaCount: mangaList.length,
            mangaIndex: index,
            ...item,
          },
        },
      })
    })
  }
}

/**
 * 扫描目录
 * @param dir
 * @returns
 */
function scan_path(dir: string) {
  let folderList = fs.readdirSync(dir)
  let mangaList = []

  // 在列表中去除. .. 文件夹
  folderList = folderList.filter((item) => {
    return item !== '.' && item !== '..'
  })

  // 根据正则规则过滤出漫画目录
  folderList = folderList.filter((item) => {
    const itemPath = path.join(dir, item)

    // 检查是否为文件夹
    if (!fs.statSync(itemPath).isDirectory()) {
      return false
    }

    // 排除元数据文件夹
    if (/smanga-info/.test(itemPath)) {
      return false
    }

    // 包含匹配
    if (pathInfo.include) {
      return new RegExp(pathInfo.include).test(item)
    }

    // 排除匹配
    if (pathInfo.exclude) {
      return !new RegExp(pathInfo.exclude).test(item)
    }

    return true
  })

  mangaList = folderList.map((item: any) => {
    const itemPath = path.join(dir, item)

    return {
      mangaPath: itemPath,
      mangaName: item,
      mangaType: 'img',
      parentPath: dir,
    }
  })

  return mangaList
}

/**
 * 扫描二级目录
 * @returns 漫画列表平铺
 */
function scan_path_parent() {
  let mangaList: mangaItem[] = []
  let folderList = fs.readdirSync(pathInfo.pathContent)

  // 在列表中去除. .. 文件夹
  folderList = folderList.filter((item) => {
    return item !== '.' && item !== '..'
  })

  folderList = folderList.filter((item) => {
    const itemPath = path.join(pathInfo.pathContent, item)

    // 检查是否为文件夹
    if (!fs.statSync(itemPath).isDirectory()) {
      return false
    }

    // 排除元数据文件夹
    if (/smanga-info/.test(itemPath)) {
      return false
    }

    // 包含匹配
    if (pathInfo.include) {
      return new RegExp(pathInfo.include).test(itemPath)
    }

    // 排除匹配
    if (pathInfo.exclude) {
      return !new RegExp(pathInfo.exclude).test(itemPath)
    }

    return true
  })

  folderList.map((item) => {
    // 二级目录扫描
    const itemPath = path.join(pathInfo.pathContent, item)
    mangaList = mangaList.concat(scan_path(itemPath))
  })

  return mangaList
}
