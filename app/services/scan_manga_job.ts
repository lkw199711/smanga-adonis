import * as fs from 'fs'
import * as path from 'path'
import prisma from '#start/prisma'
import { Prisma } from '@prisma/client'
import { path_poster, path_cache, is_img, get_config, first_image, is_directory, extensions } from '#utils/index'
import { S } from '../utils/convertText.js'
import { extractFirstImageSyncOrder } from '#utils/unzip'
import { Unrar } from '#utils/unrar'
import { Un7z } from '#utils/un7z'
import { TaskPriority } from '../type/index.js'
import { addTask, scanQueue } from '#services/queue_service'
import { error_log, insert_manga_scan_log } from '#utils/log'
import { path as sqlPathType, media as sqlMediaType } from '@prisma/client'
import { metaType } from '../type/index.js'
type pathType = sqlPathType & { media: sqlMediaType }
const logModule = '[manga scan]'

export default class ScanMangaJob {
  private pathId: number
  private pathInfo: pathType | null | void = null
  private mediaInfo: sqlMediaType | null | void = null
  private mangaRecord: any
  private chapterRecord: any
  private mangaPath: string
  private mangaName: string
  private parentPath: string
  private cachePath: string = ''
  private nonNumericChapterCounter: number | null = null
  private meta: any = null
  private ignoreHiddenFiles: boolean
  private tagColor: string

  constructor({ pathId, mangaPath, mangaName, parentPath }: { pathId: number, pathInfo: any, mediaInfo: any, mangaPath: string, mangaName: string, parentPath: string }) {
    this.pathId = pathId
    this.mangaPath = mangaPath
    this.mangaName = mangaName
    this.parentPath = parentPath

    const config = get_config()
    this.ignoreHiddenFiles = config.scan?.ignoreHiddenFiles === 1
    this.tagColor = config.scan?.defaultTagColor || '#a0d911'
  }

  async run() {
    const pathId = this.pathId
    this.pathInfo = await prisma.path.findUnique({ where: { pathId }, include: { media: true } }).catch(async (e) => { await error_log(logModule, e.message) })
    this.mediaInfo = this.pathInfo?.media
    const mangaPath = this.mangaPath
    const mangaName = this.mangaName
    const parentPath = this.parentPath
    const reloadCover = get_config()?.scan?.reloadCover ?? 0

    if (!this.pathInfo) {
      await error_log(logModule, `pathId ${pathId}路径不存在`)
      return
    }

    if (!this.mediaInfo) {
      error_log(logModule, `pathId ${pathId}媒体库不存在`)
      return
    }

    this.cachePath = path_cache()

    // 更新路径扫描时间
    await prisma.path.update({ where: { pathId }, data: { lastScanTime: new Date() } }).catch(async (e) => { await error_log(logModule, e.message) })

    let mangaInsert: Prisma.mangaCreateInput

    // 将标题繁简体转换后写入副标题,用于检索
    const sName = S.t2s(mangaName)
    const tName = S.s2t(mangaName)
    const subTitle = `${sName}/${tName}`

    // 漫画插入数据
    mangaInsert = {
      media: {
        connect: {
          mediaId: this.mediaInfo.mediaId,
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
      browseType: this.mediaInfo.browseType,
      chapterCount: 1,
      mangaNumber: this.manga_number(mangaName),
    }

    // 检查库中是否存在此漫画
    this.mangaRecord = await prisma.manga.findFirst({
      where: {
        AND: [{ mangaName }, { mediaId: this.pathInfo.mediaId }],
      },
    })

    if (this.mediaInfo.mediaType == 1) {
      /**
       * 当漫画类型为单本漫画
       */

      // 漫画已存在 跳过此漫画
      if (this.mangaRecord) {
        // 如果漫画已被标记为删除,则恢复漫画
        if (this.mangaRecord.deleteFlag) {
          await prisma.manga.update({
            where: { mangaId: this.mangaRecord.mangaId },
            data: { deleteFlag: 0 },
          })
        }
        return;
      }

      mangaInsert.chapterCount = 1

      this.mangaRecord = await prisma.manga.create({ data: mangaInsert })

      // 扫描元数据
      await this.meta_scan()
      await this.meta_scan_series()

      // 更新漫画封面
      if (!this.mangaRecord.mangaCover || reloadCover) {
        await this.manga_poster(mangaPath)
      }

      const chapterInsert: Prisma.chapterCreateInput = {
        manga: {
          connect: {
            mangaId: this.mangaRecord.mangaId,
          },
        },
        media: {
          connect: {
            mediaId: this.mediaInfo.mediaId,
          },
        },
        pathId,
        chapterName: mangaName,
        chapterPath: mangaPath,
        browseType: this.mediaInfo.browseType,
        subTitle: subTitle,
        chapterType: this.compress_type(mangaPath),
      }

      this.chapterRecord = await prisma.chapter.create({ data: chapterInsert })
      if (!this.chapterRecord) {
        console.log('章节插入失败', mangaName)
        return
      }

      // 获取封面图
      if (!this.chapterRecord.chapterCover || reloadCover) {
        await this.chapter_poster(mangaPath)
      }

      // 讲漫画扫描成果写入日志
      await insert_manga_scan_log({
        mangaId: this.mangaRecord.mangaId,
        mangaName: this.mangaRecord.mangaName,
        newChapters: 1,
      });
    } else {
      /**
       * 当漫画类型为连载漫画
       */

      // 扫描目录结构获取章节列表
      let chapterList = await this.scan_path(mangaPath)
      let chapterListSql: any = []

      if (this.mangaRecord) {
        // 如果漫画已被标记为删除,则恢复漫画
        if (this.mangaRecord.deleteFlag) {
          await prisma.manga.update({
            where: { mangaId: this.mangaRecord.mangaId },
            data: { deleteFlag: 0 },
          })
        }
        // 库中章节列表
        chapterListSql = await prisma.chapter.findMany({
          where: { mangaId: this.mangaRecord.mangaId },
        })
      } else {
        // 库中不存在则新增
        mangaInsert.chapterCount = chapterList.length
        this.mangaRecord = await prisma.manga.create({ data: mangaInsert })
      }

      if (!this.mangaRecord.mangaCover || reloadCover) {
        await this.manga_poster(mangaPath)
      }

      // 扫描元数据
      await this.meta_scan()
      await this.meta_scan_series()

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
                mangaId: this.mangaRecord.mangaId,
              },
            },
            media: {
              connect: {
                mediaId: this.mediaInfo.mediaId,
              },
            },
            pathId,
            chapterName: item.chapterName,
            chapterPath: item.chapterPath,
            browseType: this.mediaInfo.browseType,
            subTitle: subTitle,
            chapterType: this.compress_type(item.chapterPath),
            chapterNumber: this.chapter_index(item.chapterName),
          }

          try {
            this.chapterRecord = await prisma.chapter.create({ data: chapterInsert })
          } catch (e) {
            console.log('章节插入失败', item.chapterName)
            console.log(e);

            return
          }

          // 获取封面图
          if (!this.chapterRecord.chapterCover || reloadCover) {
            await this.chapter_poster(item.chapterPath)
          }
        }

        // 更新漫画更新时间
        await prisma.manga.update({
          data: { updateTime: new Date() },
          where: { mangaId: this.mangaRecord.mangaId },
        });

        // 讲漫画扫描成果写入日志
        await insert_manga_scan_log({
          mangaId: this.mangaRecord.mangaId,
          mangaName: this.mangaRecord.mangaName,
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
          mangaId: this.mangaRecord.mangaId,
          mangaName: this.mangaRecord.mangaName,
          newChapters: delChapterList.length * -1,
        });
      }

      const wattingJobs = await scanQueue.getWaiting()
      const activeJobs = await scanQueue.getActive()
      const jobs = wattingJobs.concat(activeJobs)
      const thisPathJobs = jobs.filter((job: any) => job.data.taskName === `scan_path_${pathId}`)

      // 当扫描未进行到最后一步时,不再重复提交生成媒体库封面任务
      if (thisPathJobs.length <= 1) {
        await addTask({
          taskName: `create_media_poster_${this.pathInfo.mediaId}`,
          command: 'createMediaPoster',
          args: { mediaId: this.pathInfo.mediaId },
          priority: TaskPriority.createMediaPoster,
        })
      }
    }
  }

  /**
   * 
   * @param recasn 是否重新扫描元数据
   * @returns 
   */
  async meta_scan() {
    const dirOutExt = this.mangaRecord.mangaPath.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
    const dirMeta = dirOutExt + '-smanga-info'

    // 没有元数据文件
    if (!fs.existsSync(dirMeta)) return false

    // 删除原有的元数据
    await prisma.meta.deleteMany({
      where: {
        mangaId: this.mangaRecord.mangaId,
      },
    })

    // banner,thumbnail,character
    const metaFiles = fs.readdirSync(dirMeta)
    const cahracterPics: string[] = []

    for (let index = 0; index < metaFiles.length; index++) {
      const file = metaFiles[index];
      const filePath = path.join(dirMeta, file)
      if (!is_img(file)) continue;
      if (/banner/i.test(file)) {
        await prisma.meta.create({
          data: {
            manga: {
              connect: {
                mangaId: this.mangaRecord.mangaId,
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
                mangaId: this.mangaRecord.mangaId,
              },
            },
            metaName: 'thumbnail',
            metaFile: filePath,
          },
        })
      } else if (/cover/i.test(file)) {
        await prisma.meta.create({
          data: {
            manga: {
              connect: {
                mangaId: this.mangaRecord.mangaId,
              },
            },
            metaName: 'cover',
            metaFile: filePath,
          },
        })
      } else {
        cahracterPics.push(filePath)
      }
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
      this.meta = info
      // 一般性元数据
      const keys = Object.keys(info)
      for (let index = 0; index < keys.length; index++) {
        const key = keys[index];
        const value = info[key]
        if (Object.keys(metaType).includes(key)) {
          try {
            await prisma.meta.create({
              data: {
                manga: {
                  connect: {
                    mangaId: this.mangaRecord.mangaId,
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

      // 插入标签
      const tags: string[] = info?.tags || []
      await this.tag_insert(tags)

      // 插入角色
      const characters = info?.character || []
      for (let index = 0; index < characters.length; index++) {
        const char = characters[index];
        // 同漫画内角色名唯一
        let charRecord = await prisma.meta.findFirst({
          where: { metaContent: char.name, mangaId: this.mangaRecord.mangaId },
        })
        if (!charRecord) {
          // 头像图片
          const header = cahracterPics.find((pic) => pic.includes(char.name))
          charRecord = await prisma.meta.create({
            data: {
              manga: {
                connect: {
                  mangaId: this.mangaRecord.mangaId,
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

      // 更新章节顺序
      const chapters = info?.chapters || []
      for (let index = 0; index < chapters.length; index++) {
        const chapter: any = chapters[index];
        const title = chapter.title || chapter.name;
        await prisma.chapter.updateMany({
          where: {
            mangaId: this.mangaRecord.mangaId,
            chapterName: title,
          },
          data: {
            chapterNumber: index.toString().padStart(5, '0'),
          },
        })
      }
    }
  }

  /**
   * 扫描 series.json 元数据
   * @returns 
   */
  async meta_scan_series() {
    const mangaPath = this.mangaRecord.mangaPath
    if (!is_directory(mangaPath)) return;

    const fils = fs.readdirSync(mangaPath);
    const series = fils.find(file => file === 'series.json');
    if (!series) return;

    // 删除原有的元数据
    await prisma.meta.deleteMany({
      where: {
        mangaId: this.mangaRecord.mangaId,
      },
    })

    const seriesFile = path.join(mangaPath, series);
    const rawData = fs.readFileSync(seriesFile, 'utf-8')
    const jsonParse = JSON.parse(rawData)
    this.meta = jsonParse?.metadata ? jsonParse.metadata : jsonParse

    if (this.meta?.tags) {
      const tags: string[] = typeof this.meta.tags === 'string' ? this.meta.tags.split(',') : this.meta.tags
      await this.tag_insert(tags)
    }

    if (this.meta?.authors) {
      await this.prisma_meta_insert('author', this.meta.authors);
    }

    if (this.meta?.name) {
      await this.prisma_meta_insert('title', this.meta.name);
    }

    if (this.meta?.alias) {
      await this.prisma_meta_insert('subTitle', this.meta.alias);
    }

    if (this.meta?.description_text) {
      await this.prisma_meta_insert('describe', this.meta.description_text);
    }

    if (this.meta?.year) {
      await this.prisma_meta_insert(metaType.publishDate, String(this.meta.year));
    }

    if (this.meta?.publisher) {
      await this.prisma_meta_insert(metaType.publisher, this.meta.publisher);
    }

    if (this.meta?.status) {
      await this.prisma_meta_insert(metaType.status, this.meta.status);
    }
  }

  async tag_insert(tags: any[]) {
    for (let tag of tags) {
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
            tagColor: this.tagColor,
            userId: 0,
          },
        })
      }

      const mangaTagRecord = await prisma.mangaTag.findFirst({
        where: {
          mangaId: this.mangaRecord.mangaId,
          tagId: tagRecord.tagId,
        },
      })

      if (!mangaTagRecord) {
        await prisma.mangaTag
          .create({
            data: {
              mangaId: this.mangaRecord.mangaId,
              tagId: tagRecord.tagId,
            },
          })
          .catch((e) => {
            console.log('标签插入失败', e)
          })
      }
    }
  }

  /**
   * 向数据库中插入元数据
   * @param key 元数据名称
   * @param value 元数据值
   */
  async prisma_meta_insert(key: string, value: string) {
    await prisma.meta.create({
      data: {
        manga: {
          connect: {
            mangaId: this.mangaRecord.mangaId,
          },
        },
        metaName: key,
        metaContent: value,
      }
    })
  }

  /**
   * 扫描目录获取章节列表
   * @param dir 目录路径
   * @returns 章节列表
   */
  async scan_path(dir: string) {
    // 检查是否为文件夹
    if (!fs.statSync(dir).isDirectory()) {
      console.log('指定非目录文件,请检查 媒体库类型 设置')
      return []
    }

    let folderList = fs.readdirSync(dir)
    let chapterList: any = []

    folderList = folderList.filter((item) => {
      // 排除. .. 文件夹
      if (item === '.' || item === '..') {
        return false
      }

      // 排除隐藏文件夹
      if (this.ignoreHiddenFiles && /^\./.test(item)) {
        return false
      }

      // 包含匹配
      if (this.pathInfo?.include) {
        return new RegExp(this.pathInfo.include).test(item)
      }

      // 排除匹配
      if (this.pathInfo?.exclude) {
        return !new RegExp(this.pathInfo.exclude).test(item)
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

  async chapter_poster(dir: string) {
    const posterPath = path_poster()
    // 为防止rar包内默认的文件名与chapterId重名,加入特定前缀
    const posterName = `${posterPath}/smanga_chapter_${this.chapterRecord.chapterId}.jpg`
    // 压缩目标图片大小
    const maxSizeKB = get_config()?.compress?.poster || 100
    // 不复制封面,直接使用源文件
    const doNotCopyCover = get_config()?.scan?.doNotCopyCover ?? 1
    // 是否在压缩包内找到封面
    let hasPosterInZip = false
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
    if (!sourcePoster && this.chapterRecord.chapterType === 'img') {
      sourcePoster = first_image(dir)
    }

    if (!sourcePoster && ['zip', 'rar', '7z'].includes(this.chapterRecord.chapterType)) {
      // 解压缩获取封面
      const cachePoster = `${this.cachePath}/smanga_cache_${this.chapterRecord.chapterId}.jpg`

      if (this.chapterRecord.chapterType === 'zip') {
        hasPosterInZip = await extractFirstImageSyncOrder(dir, cachePoster)
        if (hasPosterInZip) {
          sourcePoster = cachePoster
        }
      } else if (this.chapterRecord.chapterType === 'rar') {
        const unrar = new Unrar(dir, cachePoster)
        hasPosterInZip = await unrar.extract_first_image_order(dir, cachePoster)
        if (hasPosterInZip) {
          sourcePoster = cachePoster
        }
      } else if (this.chapterRecord.chapterType === '7z') {
        const un7z = new Un7z(dir, cachePoster)
        const image = await un7z.first_image_7z(dir, this.cachePath)
        if (image) {
          sourcePoster = `${this.cachePath}/${image}`
        }
        // 7z
      }
    }

    // 不复制封面,直接使用源文件
    if (!hasPosterInZip && sourcePoster && doNotCopyCover && fs.statSync(sourcePoster).size <= maxSizeKB * 1024) {
      await prisma.chapter.update({
        where: { chapterId: this.chapterRecord.chapterId },
        data: { chapterCover: sourcePoster },
      })

      this.chapterRecord.chapterCover = sourcePoster

      if (!this.mangaRecord.mangaCover) {
        // 直接使用update的返回值会丢失id 才用补充赋值的形式补全数据
        await prisma.manga.update({
          where: { mangaId: this.mangaRecord.mangaId },
          data: { mangaCover: sourcePoster },
        })

        this.mangaRecord.mangaCover = sourcePoster
      }

      return sourcePoster
    }

    if (sourcePoster) {
      // 写入漫画与章节封面
      await prisma.chapter.update({
        where: { chapterId: this.chapterRecord.chapterId },
        data: { chapterCover: posterName },
      })
      this.chapterRecord.chapterCover = posterName

      if (!this.mangaRecord.mangaCover) {
        // 直接使用update的返回值会丢失id 才用补充赋值的形式补全数据
        await prisma.manga.update({
          where: { mangaId: this.mangaRecord.mangaId },
          data: { mangaCover: posterName },
        })
        this.mangaRecord.mangaCover = posterName
      }

      // 压缩图片
      // await compressImageToSize(sourcePoster, posterName, maxSizeKB)

      // 复制封面到poster目录 使用单独任务队列
      const args = {
        inputPath: sourcePoster,
        outputPath: posterName,
        maxSizeKB,
        chapterRecord: this.chapterRecord
      }

      await addTask({
        taskName: `scan_path_${this.pathId}`,
        command: 'copyPoster',
        args,
        priority: TaskPriority.copyPoster,
        timeout: 1000 * 6,
      })

      return posterName
    } else {
      return ''
    }
  }

  async manga_poster(dir: string) {
    const posterPath = path_poster()
    // 为防止rar包内默认的文件名与chapterId重名,加入特定前缀
    const posterName = `${posterPath}/smanga_manga_${this.mangaRecord.mangaId}.jpg`
    // 压缩目标图片大小
    const maxSizeKB = get_config()?.compress?.poster ?? 100
    const doNotCopyCover = get_config()?.scan?.doNotCopyCover ?? 1
    // 源封面
    let sourcePoster = ''
    // 检索平级目录封面图片
    const dirOutExt = dir.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
    extensions.some((ext) => {
      const picPath = dirOutExt + ext
      if (fs.existsSync(picPath)) {
        sourcePoster = picPath
        return true
      }
    })

    // 检索漫画文件夹内的封面图片
    if (!sourcePoster && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      extensions.some((ext) => {
        const picPath = path.join(dir, 'cover' + ext)
        if (fs.existsSync(picPath)) {
          sourcePoster = picPath
          return true
        }
      })
    }

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

    // 不复制封面,直接使用源文件
    if (sourcePoster && doNotCopyCover && fs.statSync(sourcePoster).size <= maxSizeKB * 1024) {
      await prisma.manga.update({
        where: { mangaId: this.mangaRecord.mangaId },
        data: { mangaCover: sourcePoster },
      })
      this.mangaRecord.mangaCover = sourcePoster
      return sourcePoster
    }

    if (sourcePoster) {
      // 复制封面到poster目录 使用单独任务队列
      const args = {
        inputPath: sourcePoster,
        outputPath: posterName,
        maxSizeKB,
        mangaRecord: this.mangaRecord
      }

      await addTask({
        taskName: `scan_path_${this.pathId}`,
        command: 'copyPoster',
        args,
        priority: TaskPriority.copyPoster,
        timeout: 1000 * 6,
      })

      await prisma.manga.update({
        where: { mangaId: this.mangaRecord.mangaId },
        data: { mangaCover: posterName },
      })
      this.mangaRecord.mangaCover = posterName

      return posterName
    } else {
      return ''
    }
  }

  compress_type(filePath: string) {
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

  chapter_number(chapterName: string, width: number = 5) {
    // 使用正则表达式匹配数字部分及其后面可能的符号 (., -, _)
    const match = chapterName.match(/(\d+[\.\-_]*\d*)/)

    if (!match) {
      // 如果没有匹配到数字部分，为非数字章节分配一个递增的值
      if (this.nonNumericChapterCounter === null) {
        // 生成初始值 (90, 900, 9000, ...)
        this.nonNumericChapterCounter = parseInt('9'.padEnd(width, '0'))
      }
      const nonNumericValue = (this.nonNumericChapterCounter++).toString()

      return nonNumericValue.padStart(width, '0')
    }

    const [_, numPart] = match

    // 将数字部分进行补位，保留符号部分
    const paddedNumPart = numPart.replace(/^(\d+)/, (match) => match.padStart(width, '0'))

    return paddedNumPart
  }

  manga_number(mangaName: string, width: number = 3) {
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

  isDirectory(filePath: string) {
    try {
      const stats = fs.statSync(filePath)
      return stats.isDirectory()
    } catch (err) {
      // 如果路径不存在或其他错误，返回 false
      // console.error('Error:', err)
      return false
    }
  }

  chapter_index(chapterName: string) {
    if (!this.meta?.chapters) return this.chapter_number(chapterName);

    const chapterIndex = this.meta.chapters.findIndex((chapter: any) => [chapter?.chapterName, chapter?.name, chapter.title].includes(chapterName));

    return chapterIndex === -1 ? this.chapter_number(chapterName) : chapterIndex.toString().padStart(5, '0');
  }
}
