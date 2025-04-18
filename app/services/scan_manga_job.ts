/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-29 15:44:04
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-02-15 03:42:59
 * @FilePath: \smanga-adonis\app\services\scan_manga_job.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import prisma from '#start/prisma'
import { Prisma } from '@prisma/client'
import { path_poster, path_cache, is_img, get_config } from '../utils/index.js'
import { S } from '../utils/convertText.js'
import { extractFirstImageSyncOrder } from '#utils/unzip'
import { Unrar } from '#utils/unrar'
import { Un7z } from '#utils/un7z'
import { TaskPriority } from '../type/index.js'
import { scanQueue } from '#services/queue_service'
import { compressImageToSize } from '#utils/sharp'
import { s_delete } from '#utils/index'
import CreateMediaPosterJob from '#services/create_media_poster_job'
import { insert_manga_scan_log } from '#utils/log'

export default class ScanMangaJob {
  private pathId: number
  private pathInfo: any
  private mediaInfo: any
  private mangaPath: string
  private mangaName: string
  private parentPath: string

  constructor({ pathId, pathInfo, mediaInfo, mangaPath, mangaName, parentPath }: { pathId: number, pathInfo: any, mediaInfo: any, mangaPath: string, mangaName: string, parentPath: string }) {
    this.pathId = pathId
    this.pathInfo = pathInfo
    this.mediaInfo = mediaInfo
    this.mangaPath = mangaPath
    this.mangaName = mangaName
    this.parentPath = parentPath
  }

  async run() {
    const pathId = this.pathId
    const pathInfo = this.pathInfo
    const mediaInfo = this.mediaInfo
    const mangaPath = this.mangaPath
    const mangaName = this.mangaName
    const parentPath = this.parentPath

    let mangaRecord: any = null
    let chapterRecord: any = null
    let nonNumericChapterCounter: number | null = null
    const cachePath = path_cache()

    // 更新路径扫描时间
    await prisma.path.update({ where: { pathId }, data: { lastScanTime: new Date() } })

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
      mangaNumber: manga_number(mangaName),
    }

    // 检查库中是否存在此漫画
    mangaRecord = await prisma.manga.findFirst({
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

      mangaRecord = await prisma.manga.create({ data: mangaInsert })

      // 扫描元数据
      await meta_scan()

      if (!mangaRecord.mangaCover) {
        await manga_poster(mangaPath)
      }

      const chapterInsert: Prisma.chapterCreateInput = {
        manga: {
          connect: {
            mangaId: mangaRecord.mangaId,
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
        chapterType: compress_type(mangaPath),
      }

      chapterRecord = await prisma.chapter.create({ data: chapterInsert })
      if (!chapterRecord) {
        console.log('章节插入失败', mangaName)
        return
      }

      // 获取封面图
      if (!chapterRecord.chapterCover) {
        await chapter_poster(mangaPath)
      }

      // 讲漫画扫描成果写入日志
      await insert_manga_scan_log({
        mangaId: mangaRecord.mangaId,
        mangaName: mangaRecord.mangaName,
        newChapters: 1,
      });
    } else {
      /**
       * 当漫画类型为连载漫画
       */

      // 扫描目录结构获取章节列表
      let chapterList = await scan_path(mangaPath)
      let chapterListSql: any = []

      if (mangaRecord) {
        // 库中章节列表
        chapterListSql = await prisma.chapter.findMany({
          where: { mangaId: mangaRecord.mangaId },
        })
      } else {
        // 库中不存在则新增
        mangaInsert.chapterCount = chapterList.length
        mangaRecord = await prisma.manga.create({ data: mangaInsert })
        // 扫描元数据
        await meta_scan()
      }

      if (!mangaRecord.mangaCover) {
        await manga_poster(mangaPath)
      }

      /** 漫画已存在 更新漫画信息
       * // 实际目录扫描多于数据库章节 (说明新增了章节)
       * // 实际目录扫描等于数据库章节 (说明没有变更)
       * // 实际目录扫描少于数据库章节 (说明删除了章节)
       */
      if (chapterList.length > chapterListSql.length) {
        // 新增章节
        const newChapterList = chapterList.filter((item: any) => {
          return !chapterListSql.some((sqlItem: any) => sqlItem.chapterName === item.chapterName)
        })
        for (let index = 0; index < newChapterList.length; index++) {
          const item = newChapterList[index];
          // 将标题繁简体转换后写入副标题,用于检索
          const sName = S.t2s(item.chapterName)
          const tName = S.s2t(item.chapterName)
          const subTitle = `${sName}/${tName}`

          const chapterInsert: Prisma.chapterCreateInput = {
            manga: {
              connect: {
                mangaId: mangaRecord.mangaId,
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
            chapterType: compress_type(item.chapterPath),
            chapterNumber: chapter_number(item.chapterName),
          }

          try {
            chapterRecord = await prisma.chapter.create({ data: chapterInsert })
          } catch (e) {
            console.log('章节插入失败', item.chapterName)
            console.log(e);

            return
          }

          // 获取封面图
          if (!chapterRecord.chapterCover) {
            await chapter_poster(item.chapterPath)
          }
        }

        // 更新漫画更新时间
        await prisma.manga.update({
          data: { updateTime: new Date() },
          where: { mangaId: mangaRecord.mangaId },
        });

        // 讲漫画扫描成果写入日志
        await insert_manga_scan_log({
          mangaId: mangaRecord.mangaId,
          mangaName: mangaRecord.mangaName,
          newChapters: newChapterList.length,
        });

      } else if (chapterList.length === chapterListSql.length) {
        /**
         *  无变更
          insert_manga_scan_log({
          mangaId: mangaRecord.mangaId,
          mangaName: mangaRecord.mangaName,
          newChapters: 0,
        });
         */

      } else {
        // 删除章节
        const delChapterList = chapterListSql.filter((item: any) => {
          return !chapterList.some((sqlItem: any) => sqlItem.chapterPath === item.chapterPath)
        })

        for (let index = 0; index < delChapterList.length; index++) {
          const element = delChapterList[index];
          await prisma.chapter.delete({ where: { chapterId: element.chapterId } })
        }

        // 讲漫画扫描成果写入日志
        await insert_manga_scan_log({
          mangaId: mangaRecord.mangaId,
          mangaName: mangaRecord.mangaName,
          newChapters: delChapterList.length * -1,
        });
      }

      const wattingJobs = await scanQueue.getWaiting()
      const activeJobs = await scanQueue.getActive()
      const jobs = wattingJobs.concat(activeJobs)
      const thisPathJobs = jobs.filter((job: any) => job.data.taskName === `scan_path_${pathId}`)

      // 当扫描未进行到最后一步时,不再重复提交生成媒体库封面任务
      if (thisPathJobs.length <= 1) {
        await new CreateMediaPosterJob({ mediaId: pathInfo.mediaId }).run()
      }
    }

    // 删除缓存文件
    fs.readdirSync(cachePath).forEach((file) => {
      const filePath = path.join(cachePath, file)
      s_delete(filePath)
    })

    async function meta_scan(recasn: boolean = false) {
      const dirOutExt = mangaRecord.mangaPath.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
      const dirMeta = dirOutExt + '-smanga-info'

      // 没有元数据文件
      if (!fs.existsSync(dirMeta)) return false

      // 重扫元数据的时候删除原有元数据
      if (recasn) {
        prisma.meta.deleteMany({
          where: {
            mangaId: mangaRecord.mangaId,
          },
        })
      }

      const infoFile = path.join(dirMeta, 'info.json')
      const metaFile = path.join(dirMeta, 'meta.json')
      // 为兼容老的元数据文件 允许文件名为info
      let targetMetaFile = '';
      if (fs.existsSync(infoFile)) {
        targetMetaFile = infoFile
      } else if (fs.existsSync(metaFile)) {
        targetMetaFile = metaFile
      }

      if (fs.existsSync(targetMetaFile)) {
        const rawData = fs.readFileSync(targetMetaFile, 'utf-8')
        const info = JSON.parse(rawData)

        // 一般性元数据
        const keys = Object.keys(info)
        for (let index = 0; index < keys.length; index++) {
          const key = keys[index];
          const value = info[key]
          if (['title', 'author', 'star', 'describe', 'publishDate', 'classify', 'finished', 'updateDate'].includes(key)) {
            try {
              await prisma.meta.create({
                data: {
                  manga: {
                    connect: {
                      mangaId: mangaRecord.mangaId,
                    },
                  },
                  metaName: key,
                  metaContent: String(value),
                },
              })
            } catch (e) {
              console.log(e);
            }
          }
        }

        // banner,thumbnail,character
        const metaFiles = fs.readdirSync(dirMeta)
        const cahracterPics: string[] = []
        for (let index = 0; index < metaFiles.length; index++) {
          const file = metaFiles[index];
          const filePath = path.join(dirMeta, file)
          if (!is_img(file)) return
          if (/banner/i.test(file)) {
            await prisma.meta.create({
              data: {
                manga: {
                  connect: {
                    mangaId: mangaRecord.mangaId,
                  },
                },
                metaName: 'banner',
                metaFile: filePath,
              },
            })
          } else if (/thumbnail/i.test(file)) {
            await prisma.meta.create({
              data: {
                manga: {
                  connect: {
                    mangaId: mangaRecord.mangaId,
                  },
                },
                metaName: 'thumbnail',
                metaFile: filePath,
              },
            })
          } else {
            cahracterPics.push(filePath)
          }
        }

        // 插入标签
        const tagColor = '#a0d911'
        const tags: string[] = info?.tags || []

        for (let index = 0; index < tags.length; index++) {
          const tag: any = tags[index];
          // 系统标签保持唯一性,用户标签不做唯一性限制
          // 扫描时确认没有同名系统标签,没有则创建
          const tagName = typeof tag === 'object' ? tag.name : tag
          let tagRecord = await prisma.tag.findFirst({
            where: { tagName: tagName, userId: 0 },
          })
          if (!tagRecord) {
            tagRecord = await prisma.tag.create({
              data: {
                tagName: tagName,
                tagColor,
                userId: 0,
              },
            })
          }

          const mangaTagRecord = await prisma.mangaTag.findFirst({
            where: {
              mangaId: mangaRecord.mangaId,
              tagId: tagRecord.tagId,
            },
          })

          if (!mangaTagRecord) {
            await prisma.mangaTag
              .create({
                data: {
                  mangaId: mangaRecord.mangaId,
                  tagId: tagRecord.tagId,
                },
              })
              .catch((e) => {
                console.log('标签插入失败', e)
              })
          }
        }

        // 插入角色
        const characters = info?.character || []
        for (let index = 0; index < characters.length; index++) {
          const char = characters[index];
          // 同漫画内角色名唯一
          let charRecord = await prisma.meta.findFirst({
            where: { metaContent: char.name, mangaId: mangaRecord.mangaId },
          })
          if (!charRecord) {
            // 头像图片
            const header = cahracterPics.find((pic) => pic.includes(char.name))
            charRecord = await prisma.meta.create({
              data: {
                manga: {
                  connect: {
                    mangaId: mangaRecord.mangaId,
                  },
                },
                metaName: 'character',
                metaContent: char.name,
                description: char.description,
                metaFile: header,
              },
            })
          }
        }
      }
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
        // 文件夹章节 全名作为章节名
        let chapterName = fileName
        const chapterPath = itemPath

        // 如果不是目录
        let type = 'img'
        if (!fs.statSync(itemPath).isDirectory()) {
          // 文件章节 获取其基础名称作为章节名
          chapterName = path.basename(item, path.extname(item))
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

        chapterList.push({ chapterName, chapterPath, fileName, chapterType: type })
      })

      return chapterList
    }

    async function chapter_poster(dir: string) {
      const posterPath = path_poster()
      // 为防止rar包内默认的文件名与chapterId重名,加入特定前缀
      const posterName = `${posterPath}/smanga_chapter_${chapterRecord.chapterId}.jpg`
      // 压缩目标图片大小
      const maxSizeKB = get_config()?.compress?.poster || 100
      // 源封面
      let sourcePoster = ''
      // 检索平级目录封面图片
      const dirOutExt = dir.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
      const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP']
      extensions.some((ext) => {
        const picPath = dirOutExt + ext
        if (fs.existsSync(picPath)) {
          sourcePoster = picPath
          return true
        }
      })

      // 检索元数据目录封面图片
      const dirMeta = dirOutExt + '-smanga-info'
      if (fs.existsSync(dirMeta)) {
        extensions.some((ext) => {
          const picPath = dirMeta + '/cover' + ext
          if (fs.existsSync(picPath)) {
            sourcePoster = picPath
            return true
          }
        })
      }

      // 都没有找到返回空
      if (!sourcePoster && chapterRecord.chapterType === 'img') {
        sourcePoster = first_image(dir)
      }

      if (!sourcePoster && ['zip', 'rar', '7z'].includes(chapterRecord.chapterType)) {
        // 解压缩获取封面
        const cachePoster = `${cachePath}/smanga_cache_${chapterRecord.chapterId}.jpg`
        let hasPosterInZip = false
        if (chapterRecord.chapterType === 'zip') {
          hasPosterInZip = await extractFirstImageSyncOrder(dir, cachePoster)
          if (hasPosterInZip) {
            sourcePoster = cachePoster
          }
        } else if (chapterRecord.chapterType === 'rar') {
          const unrar = new Unrar(dir, cachePoster)
          hasPosterInZip = await unrar.extract_first_image_order(dir, cachePoster)
          if (hasPosterInZip) {
            sourcePoster = cachePoster
          }
        } else if (chapterRecord.chapterType === '7z') {
          const un7z = new Un7z(dir, cachePoster)
          const image = await un7z.first_image_7z(dir, cachePath)
          if (image) {
            sourcePoster = `${cachePath}/${image}`
          }
          // 7z
        }
      }

      if (sourcePoster) {
        // 写入漫画与章节封面
        try {

          await prisma.chapter.update({
            where: { chapterId: chapterRecord.chapterId },
            data: { chapterCover: posterName },
          })
          chapterRecord.chapterCover = posterName
        } catch (e) {
          console.log('章节封面插入失败', e)
        }

        if (!mangaRecord.mangaCover) {
          // 直接使用update的返回值会丢失id 才用补充赋值的形式补全数据
          await prisma.manga.update({
            where: { mangaId: mangaRecord.mangaId },
            data: { mangaCover: posterName },
          })

          mangaRecord.mangaCover = posterName
        }

        // 压缩图片
        await compressImageToSize(sourcePoster, posterName, maxSizeKB)
        /*      
              // 复制封面到poster目录 使用单独任务队列
              const args = {
                inputPath: sourcePoster,
                outputPath: posterName,
                maxSizeKB,
                chapterRecord
              }
        
              
        
              scanQueue.add({
                taskName: `scan_path_${pathId}`,
                command: 'copyPoster',
                args
              }, {
                priority: TaskPriority.copyPoster,
                timeout: 1000 * 6,
              })
        */
        return posterName
      } else {
        return ''
      }
    }

    async function manga_poster(dir: string) {
      const posterPath = path_poster()
      // 为防止rar包内默认的文件名与chapterId重名,加入特定前缀
      const posterName = `${posterPath}/smanga_manga_${mangaRecord.mangaId}.jpg`
      // 压缩目标图片大小
      const maxSizeKB = get_config()?.compress?.poster || 100
      // 源封面
      let sourcePoster = ''
      // 检索平级目录封面图片
      const dirOutExt = dir.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
      const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP']
      extensions.some((ext) => {
        const picPath = dirOutExt + ext
        if (fs.existsSync(picPath)) {
          sourcePoster = picPath
          return true
        }
      })

      // 检索元数据目录封面图片
      const dirMeta = dirOutExt + '-smanga-info'
      if (!sourcePoster && fs.existsSync(dirMeta)) {
        extensions.some((ext) => {
          const picPath = dirMeta + '/cover' + ext
          if (fs.existsSync(picPath)) {
            sourcePoster = picPath
            return true
          }
        })
      }

      if (sourcePoster) {
        // 复制封面到poster目录 使用单独任务队列
        const args = {
          inputPath: sourcePoster,
          outputPath: posterName,
          maxSizeKB,
          mangaRecord
        }

        scanQueue.add({
          taskName: `scan_path_${pathId}`,
          command: 'copyPoster',
          args
        }, {
          priority: TaskPriority.copyPoster,
          timeout: 1000 * 6,
        })

        await prisma.manga.update({
          where: { mangaId: mangaRecord.mangaId },
          data: { mangaCover: posterName },
        })
        mangaRecord.mangaCover = posterName

        return posterName
      } else {
        return ''
      }
    }

    function first_image(dir: string): string {
      if (!isDirectory(dir)) return ''
      const files = fs.readdirSync(dir, { withFileTypes: true })

      for (const file of files) {
        const fullPath = path.join(dir, file.name)

        if (file.isDirectory()) {
          // 递归遍历子目录
          const found = first_image(fullPath)
          if (found) return found
        } else if (file.isFile() && is_img(file.name)) {
          // 如果找到图片，返回路径
          return fullPath
        }
      }

      // 没有找到图片
      return ''
    }

    function compress_type(filePath: string) {
      // 检查是否为目录
      if (fs.statSync(filePath).isDirectory()) return 'img'

      // 获取小写的文件扩展名
      const ext = path.extname(filePath).toLowerCase()

      // 使用对象映射扩展名到类型
      const typeMapping: any = {
        '.cbr': 'zip',
        '.cbz': 'zip',
        '.zip': 'zip',
        '.epub': 'zip',
        '.rar': 'rar',
        '.7z': '7z',
        '.pdf': 'pdf',
      }

      // 返回对应类型，如果没有匹配，默认返回 'img'
      return typeMapping[ext] || 'img'
    }

    function chapter_number(chapterName: string, width: number = 5) {
      // 使用正则表达式匹配数字部分及其后面可能的符号 (., -, _)
      const match = chapterName.match(/(\d+[\.\-_]*\d*)/)

      if (!match) {
        // 如果没有匹配到数字部分，为非数字章节分配一个递增的值
        if (nonNumericChapterCounter === null) {
          // 生成初始值 (90, 900, 9000, ...)
          nonNumericChapterCounter = parseInt('9'.padEnd(width, '0'))
        }
        const nonNumericValue = (nonNumericChapterCounter++).toString()

        return nonNumericValue.padStart(width, '0')
      }

      const [_, numPart] = match

      // 将数字部分进行补位，保留符号部分
      const paddedNumPart = numPart.replace(/^(\d+)/, (match) => match.padStart(width, '0'))

      return paddedNumPart
    }

    function manga_number(mangaName: string, width: number = 3) {
      // 使用正则表达式匹配数字部分及其后面可能的符号 (., -, _)
      const match = mangaName.match(/(\d+[\.\-_]*\d*)/)

      if (!match) {
        return ''
      }

      const [_, numPart] = match

      // 将数字部分进行补位，保留符号部分
      const paddedNumPart = numPart.replace(/^(\d+)/, (match) => match.padStart(width, '0'))

      return paddedNumPart
    }

    function isDirectory(filePath: string) {
      try {
        const stats = fs.statSync(filePath)
        return stats.isDirectory()
      } catch (err) {
        // 如果路径不存在或其他错误，返回 false
        // console.error('Error:', err)
        return false
      }
    }
  }
}
