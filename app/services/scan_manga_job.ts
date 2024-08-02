/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-29 15:44:04
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-07-31 15:51:02
 * @FilePath: \smanga-adonis\app\services\scan_manga_job.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import prisma from '#start/prisma'
import { Prisma } from '@prisma/client'
// @ts-ignore
import { S } from '../utils/convertText.cjs'

export default async function handle({
  pathId,
  pathInfo,
  mediaInfo,
  mangaPath,
  mangaName,
  mangaType,
  parentPath,
  mangaCount,
  mangaIndex,
}: any) {
  // 更新路径扫描时间
  await prisma.path.update({ where: { pathId }, data: { lastScanTime: new Date() } })
  // 更新扫描记录-进行中
  await prisma.scan.create({
    data: {
      pathId,
      scanStatus: 'scaning',
      pathContent: mangaPath,
    },
  })

  let mangaInsert: Prisma.mangaCreateInput

  // 将标题繁简体转换后写入副标题,用于检索
  const sName = S.t2s(mangaName)
  const tName = S.s2t(mangaName)
  const subTitle = `${sName}/${tName}`

  // 漫画插入数据
  mangaInsert = {
    media: {
      connect: {
        mediaId: mediaInfo.mediaId,
      },
    },
    path: {
      connect: {
        pathId,
      },
    },
    mangaName,
    subTitle,
    parentPath,
    mangaPath,
    mangaCover: '',
    browseType: mediaInfo.browseType,
    chapterCount: 1,
  }

  // 扫描元数据

  // 检查库中是否存在此漫画
  const mangaRecord = await prisma.manga.findFirst({
    where: {
      AND: [{ mangaName }, { mediaId: pathInfo.mediaId }],
    },
  })

  if (mediaInfo.mediaType == 1) {
    /**
     * 当漫画类型为单本漫画
     */

    // 漫画已存在 跳过此漫画
    if (mangaRecord) return

    mangaInsert.chapterCount = 1

    const mangaInsertRes = await prisma.manga.create({ data: mangaInsert })

    const chapterInsert: Prisma.chapterCreateInput = {
      manga: {
        connect: {
          mangaId: mangaInsertRes.mangaId,
        },
      },
      media: {
        connect: {
          mediaId: mediaInfo.mediaId,
        },
      },
      pathId,
      chapterName: mangaName,
      chapterPath: mangaPath,
      browseType: mediaInfo.browseType,
      subTitle: subTitle,
      chapterType: mangaType,
    }

    const chapterInsertRes = await prisma.chapter.create({ data: chapterInsert })

    // 通过解压部分获取封面
  } else {
    /**
     * 当漫画类型为连载漫画
     */

    // 扫描目录结构获取章节列表
    let chapterList = await scan_path(mangaPath)
    let chapterListSql: any = []
    let mangaInsertRes = null

    // 库中不存在则新增
    if (mangaRecord) {
      // 库中章节列表
      chapterListSql = await prisma.chapter.findMany({
        where: { mangaId: mangaRecord.mangaId },
      })
      // console.log(chapterListSql, 'chapterListSql')
    } else {
      mangaInsert.chapterCount = chapterList.length
      mangaInsertRes = await prisma.manga.create({ data: mangaInsert })

      // console.log(mangaInsertRes, 'mangaInsertRes')
    }

    const mangaInfo = mangaRecord || mangaInsertRes

    if (!mangaInfo) return

    /** 漫画已存在 更新漫画信息
     * // 实际目录扫描多于数据库章节 (说明新增了章节)
     * // 实际目录扫描等于数据库章节 (说明没有变更)
     * // 实际目录扫描少于数据库章节 (说明删除了章节)
     */
    if (chapterList.length > chapterListSql.length) {
      // 新增章节
      const newChapterList = chapterList.filter((item: any) => {
        return !chapterListSql.some((sqlItem: any) => sqlItem.chapterPath === item.chapterPath)
      })

      newChapterList.forEach(async (item: any) => {
        const chapterInsert: Prisma.chapterCreateInput = {
          manga: {
            connect: {
              mangaId: mangaInfo.mangaId,
            },
          },
          media: {
            connect: {
              mediaId: mediaInfo.mediaId,
            },
          },
          pathId,
          chapterName: item.chapterName,
          chapterPath: item.chapterPath,
          browseType: mediaInfo.browseType,
          subTitle: subTitle,
          chapterType: mangaType,
        }

        await prisma.chapter.create({ data: chapterInsert })

        // 通过部分解压获取封面图
      })
    } else if (chapterList.length === chapterListSql.length) {
      // 无变更
    } else {
      // 删除章节
      const delChapterList = chapterListSql.filter((item: any) => {
        return !chapterList.some((sqlItem: any) => sqlItem.chapterPath === item.chapterPath)
      })

      delChapterList.forEach(async (item: any) => {
        await prisma.chapter.delete({ where: { chapterId: item.chapterId } })
      })
    }
  }

  // 其他元数据操作

  // 更新扫描记录-扫描结束
  if (mangaIndex >= mangaCount - 1) {
    prisma.scan.update({
      where: { pathId },
      data: {
        scanStatus: 'completed',
      },
    })
  }

  async function scan_path(dir: string) {
    dir = mangaPath
    // 检查是否为文件夹
    if (!fs.statSync(dir).isDirectory()) {
      console.log('指定非目录文件,请检查 媒体库类型 设置')
      return []
    }

    let folderList = fs.readdirSync(dir)
    let chapterList: any = []

    // 在列表中去除. .. 文件夹
    folderList = folderList.filter((item) => {
      return item !== '.' && item !== '..'
    })

    folderList = folderList.filter((item) => {
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

    folderList.forEach((item) => {
      const itemPath = path.join(dir, item)
      const fileName = item
      const chapterName = path.basename(item, path.extname(item));
      const chapterPath = itemPath

      // 如果不是目录
      let type = 'img'
      if (!fs.statSync(itemPath).isDirectory()) {
        if (/(.cbr|.cbz|.zip|.epub)$/.test(itemPath)) {
          type = 'zip'
        } else if (/.7z$/i.test(itemPath)) {
          type = '7z'
        } else if (/.rar$/i.test(itemPath)) {
          type = 'rar'
        } else if (/.pdf$/i.test(itemPath)) {
          type = 'pdf'
        } else {
          return
        }
      }

      chapterList.push({ chapterName, chapterPath, fileName, chapterType: type})
    })
console.log(chapterList, 'chapterList');

    return chapterList
  }
}
