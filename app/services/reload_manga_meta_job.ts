import prisma from '#start/prisma'
import fs from 'fs'
import path from 'path'
import { error_log } from '#utils/log'
import {
  is_img,
  get_config,
  path_poster,
  path_cache,
  first_image,
  is_directory,
  extensions,
  metaImgKeys,
  path_meta,
} from '#utils/index'
import { addTask } from './queue_service.js'
import { TaskPriority } from '#type/index'
import { extract_metadata, extract_cover } from '#utils/unzip'
import { Unrar } from '#utils/unrar'
import { Un7z } from '#utils/un7z'
import { metaKeyType } from '../type/index.js'
import { comicinfo_transform } from '#utils/meta'

export default class ReloadMangaMetaJob {
  private mangaId: number
  private mangaRecord: any
  private mediaRecord: any
  private chapterRecord: any
  private cachePath: string = ''
  private meta: any
  private tagColor // 默认标签颜色
  private isCloudMedia: boolean = false
  private smangaMetaFolder: string = ''
  private hasDataMeta: boolean = false
  private alreadyExistManga: boolean = false
  constructor({ mangaId }: { mangaId: number }) {
    this.mangaId = mangaId
    const config = get_config()
    this.tagColor = config.scan?.defaultTagColor || '#a0d911'
  }

  async run() {
    this.cachePath = path_cache()
    this.mangaRecord = await prisma.manga
      .findUnique({ where: { mangaId: this.mangaId } })
      .catch(async (error) => {
        await error_log(
          '[manga scan]',
          `扫描元数据任务失败,漫画信息不存在 ${this.mangaId} ${error}`
        )
        return null
      })

    if (!this.mangaRecord) {
      return
    } else {
      this.alreadyExistManga = true
    }

    this.mediaRecord = await prisma.media
      .findUnique({ where: { mediaId: this.mangaRecord.mediaId } })
      .catch(async (error) => {
        await error_log(
          '[manga scan]',
          `扫描元数据任务失败,云盘库信息不存在 ${this.mangaRecord.mediaId} ${error}`
        )
        return null
      })
    
    this.isCloudMedia = this.mediaRecord.isCloudMedia;

    // 检查漫画是否有 smanga 元数据文件夹
    this.smangaMetaFolder = this.smanga_meta_folder()

    // 扫描漫画元数据
    await this.meta_scan()
    await this.meta_scan_series()
    await this.manga_poster(this.mangaRecord.mangaPath)

    // 更新章节封面
    const sqlChapters = await prisma.chapter.findMany({
      where: { mangaId: this.mangaId },
    })

    sqlChapters.forEach(async (chapter) => {
      this.chapterRecord = chapter
      await this.chapter_poster(this.chapterRecord.chapterPath)
      await this.meta_scan_comicinfo()
    })

    return true
  }

  /**
   *
   * @param recasn 是否重新扫描元数据
   * @returns
   */
  async meta_scan() {
    // 云盘库必须扫描既有缓存元数据 否则不执行
    if (this.alreadyExistManga && this.isCloudMedia && !this.hasDataMeta) return false

    // 没有元数据文件
    if (!this.smangaMetaFolder) return false

    const dirMeta = this.smangaMetaFolder

    // 删除原有的元数据
    await this.clear_manga_meta()

    const infoFile = path.join(dirMeta, 'info.json')
    const metaFile = path.join(dirMeta, 'meta.json')
    // 为兼容老的元数据文件 允许文件名为info
    let targetMetaFile = ''
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
        const key = keys[index]
        const value = info[key]
        if (Object.keys(metaKeyType).includes(key)) {
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
            console.log(e)
          }
        }
      }

      // 插入标签
      const tags: string[] = info?.tags || []
      await this.tag_insert(tags)

      // banner,thumbnail,character
      const metaFiles = fs.readdirSync(dirMeta)
      const characters = info?.character || []

      for (let index = 0; index < metaFiles.length; index++) {
        const file = metaFiles[index]
        const filePath = path.join(dirMeta, file)
        if (!is_img(file)) continue

        // 获取不带扩展名的基础名称
        const baseName = path.basename(file, path.extname(file))
        let metaName = baseName.replace(/\d/g, '')
        let metaContent = null
        let description = null
        if (!metaImgKeys.includes(metaName)) {
          const char = characters.find((char: any) => char.name === file)
          if (!char) continue
          metaName = 'character'
          metaContent = char.name
          description = char.description || ''
        }

        await prisma.meta.create({
          data: {
            manga: {
              connect: {
                mangaId: this.mangaRecord.mangaId,
              },
            },
            metaName,
            metaContent,
            description,
            metaFile: filePath,
          },
        })
      }

      // 更新章节顺序
      const chapters = info?.chapters || []
      for (let index = 0; index < chapters.length; index++) {
        const chapter: any = chapters[index]
        const title = chapter.title || chapter.name
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
   * 扫描comicinfo元数据
   * @returns
   */
  async meta_scan_comicinfo() {
    // 漫画为smanga定制格式 不扫描 series.json
    if (this.smangaMetaFolder) return false
    // 云漫画不扫描 series.json
    if (this.isCloudMedia) return
    if (this.chapterRecord.chapterType !== 'zip') {
      return
    }
    const comicinfo = await extract_metadata(this.chapterRecord.chapterPath)

    if (!comicinfo) return

    // 删除原有的元数据
    await this.clear_chapter_meta()

    const metaData = comicinfo_transform(comicinfo)
    await this.insert_meta(metaData)
    await this.tag_insert(metaData.tags)
  }

  /**
   * 扫描漫画封面
   * @param dir 漫画目录
   * @returns 封面路径
   */
  async manga_poster(dir: string) {
    const posterPath = path_poster()
    // 为防止rar包内默认的文件名与chapterId重名,加入特定前缀
    const posterName = `${posterPath}/smanga_manga_${this.mangaRecord.mangaId}.jpg`
    // 压缩目标图片大小
    const maxSizeKB = get_config()?.compress?.poster ?? 300
    const doNotCopyCover = get_config()?.scan?.doNotCopyCover ?? 1
    // 源封面
    let sourcePoster = ''
    const dirOutExt = dir.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '');

    // 如果是网盘库 简化封面检索逻辑
    if (this.isCloudMedia) {
      // 元数据封面
      const metaMangaCover = path.join(this.smangaMetaFolder, 'cover.jpg')
      // 同级别目录封面
      const sidePoster = dirOutExt + '.jpg'
      // 漫画文件夹内部封面
      const picPath = path.join(dir, 'cover.jpg')
      if (fs.existsSync(metaMangaCover)) {
        sourcePoster = metaMangaCover
      } else if (fs.existsSync(sidePoster)) {
        sourcePoster = sidePoster
      } else if (fs.existsSync(picPath)) {
        // 漫画文件夹内部封面
        sourcePoster = picPath
      } else {
        // 这几样都没有 网盘库不再检测其他类型的封面
        return ''
      }
    }

    // 检索平级目录封面图片
    if (!this.isCloudMedia && !sourcePoster) {
      extensions.some((ext) => {
        const picPath = dirOutExt + ext
        if (fs.existsSync(picPath)) {
          sourcePoster = picPath
          return true
        }
      })
    }

    // 检索漫画文件夹内的封面图片
    if (
      !this.isCloudMedia &&
      !sourcePoster &&
      fs.existsSync(dir) &&
      fs.statSync(dir).isDirectory()
    ) {
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
    if (!this.isCloudMedia && !sourcePoster && fs.existsSync(dirMeta)) {
      extensions.some((ext) => {
        const picPath = dirMeta + '/cover' + ext
        if (fs.existsSync(picPath)) {
          sourcePoster = picPath
          return true
        }
      })
    }

    if (!sourcePoster) return ''

    // 不复制封面,直接使用源文件
    // 网盘库必须copy封面
    // 或者封面太大需要压缩
    const copyPoster =
      (this.isCloudMedia && !this.hasDataMeta) || fs.statSync(sourcePoster).size > maxSizeKB * 1024

    await prisma.manga.update({
      where: { mangaId: this.mangaRecord.mangaId },
      data: { mangaCover: copyPoster ? posterName : sourcePoster },
    })
    this.mangaRecord.mangaCover = copyPoster ? posterName : sourcePoster

    // 复制封面到poster目录 使用单独任务队列
    if (copyPoster) {
      this.copy_poster(sourcePoster, posterName, maxSizeKB)
    }

    return copyPoster ? posterName : sourcePoster
  }

  /**
   * 清除漫画元数据
   */
  async clear_manga_meta() {
    await prisma.meta.deleteMany({
      where: {
        mangaId: this.mangaRecord.mangaId,
        chapterId: null,
      },
    })
  }

  /**
   * 清除章节元数据
   */
  async clear_chapter_meta() {
    await prisma.meta.deleteMany({
      where: {
        mangaId: this.mangaRecord.mangaId,
        chapterId: this.chapterRecord.chapterId,
      },
    })
  }

  /**
   * 插入元数据
   * @param meta
   * @param insertChapter
   */
  async insert_meta(meta: any) {
    const insertData = []

    for (const key in meta) {
      const value = meta[key]
      insertData.push({
        mangaId: this.mangaRecord.mangaId,
        chapterId: this.chapterRecord.chapterId,
        metaName: key,
        metaContent: String(value),
      })
    }

    await prisma.meta.createMany({
      data: insertData,
    })
  }

  /**
   * 扫描章节封面
   * @param dir 章节目录
   * @returns 封面路径
   */
  async chapter_poster(dir: string) {
    const posterPath = path_poster()
    // 为防止rar包内默认的文件名与chapterId重名,加入特定前缀
    let posterName = `${posterPath}/smanga_chapter_${this.chapterRecord.chapterId}.jpg`
    // 压缩目标图片大小
    const maxSizeKB = get_config()?.compress?.poster || 300
    // 是否在压缩包内找到封面
    let hasPosterInZip = false
    let hasMetaChapterCover = false
    // 源封面
    let sourcePoster = ''
    // 检索平级目录封面图片
    const dirOutExt = dir.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')

    if (this.isCloudMedia) {
      const metaChapterCover = path.join(
        '/data/meta',
        this.mediaRecord?.mediaName || '',
        this.mangaRecord.mangaName,
        this.chapterRecord.chapterName + '.jpg'
      )
      // 同级别目录封面
      const sidePoster = dirOutExt + '.jpg'
      // 漫画文件夹内部封面
      const picPath = path.join(dir, 'cover.jpg')

      if (fs.existsSync(metaChapterCover)) {
        hasMetaChapterCover = true
        sourcePoster = metaChapterCover
      } else if (fs.existsSync(sidePoster)) {
        sourcePoster = sidePoster
      } else if (fs.existsSync(picPath)) {
        sourcePoster = picPath
      } else {
        // 这几种都没有,网盘库不再检测其他封面
        return ''
      }
    }

    if (!this.isCloudMedia && !sourcePoster) {
      const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP']
      extensions.some((ext) => {
        const picPath = dirOutExt + ext
        if (fs.existsSync(picPath)) {
          sourcePoster = picPath
          return true
        }
      })
    }

    // 都没有找到返回空
    if (!this.isCloudMedia && !sourcePoster && this.chapterRecord.chapterType === 'img') {
      sourcePoster = first_image(dir)
    }

    if (
      !this.isCloudMedia &&
      !sourcePoster &&
      ['zip', 'rar', '7z'].includes(this.chapterRecord.chapterType)
    ) {
      // 解压缩获取封面
      const cachePoster = `${this.cachePath}/smanga_cache_${this.chapterRecord.chapterId}.jpg`

      if (this.chapterRecord.chapterType === 'zip') {
        hasPosterInZip = await extract_cover(dir, cachePoster)
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

    // 未找到封面
    if (!sourcePoster) return ''

    // 不复制封面,直接使用源文件 网盘库必须copy封面
    const copyPoster =
      // 压缩包内有封面
      hasPosterInZip ||
      // 云盘库 且没有移植元数据
      (this.isCloudMedia && !hasMetaChapterCover) ||
      // 封面过大需要压缩
      fs.statSync(sourcePoster).size > maxSizeKB * 1024

    // 写入漫画与章节封面
    await prisma.chapter.update({
      where: { chapterId: this.chapterRecord.chapterId },
      data: { chapterCover: copyPoster ? posterName : sourcePoster },
    })
    this.chapterRecord.chapterCover = copyPoster ? posterName : sourcePoster

    if (!this.mangaRecord.mangaCover) {
      // 直接使用update的返回值会丢失id 才用补充赋值的形式补全数据
      await prisma.manga.update({
        where: { mangaId: this.mangaRecord.mangaId },
        data: { mangaCover: copyPoster ? posterName : sourcePoster },
      })
      this.mangaRecord.mangaCover = copyPoster ? posterName : sourcePoster
    }

    // 复制封面到poster目录 使用单独任务队列
    if (copyPoster) {
      this.copy_poster(sourcePoster, posterName, maxSizeKB)
    }

    return copyPoster ? posterName : sourcePoster
  }

  /**
   * 扫描 series.json 元数据
   * @returns
   */
  async meta_scan_series() {
    // 漫画为smanga定制格式 不扫描 series.json
    if (this.smangaMetaFolder) return false
    // 云漫画不扫描 series.json
    if (this.isCloudMedia) return
    const mangaPath = this.mangaRecord.mangaPath
    if (!is_directory(mangaPath)) return

    const fils = fs.readdirSync(mangaPath)
    const series = fils.find((file) => file === 'series.json')
    if (!series) return

    // 删除原有的元数据
    await this.clear_manga_meta()

    const seriesFile = path.join(mangaPath, series)
    const rawData = fs.readFileSync(seriesFile, 'utf-8')
    const jsonParse = JSON.parse(rawData)
    this.meta = jsonParse?.metadata ? jsonParse.metadata : jsonParse

    if (this.meta?.tags) {
      const tags: string[] =
        typeof this.meta.tags === 'string' ? this.meta.tags.split(',') : this.meta.tags
      await this.tag_insert(tags)
    }

    if (this.meta?.authors) {
      await this.prisma_meta_insert('author', this.meta.authors)
    }

    if (this.meta?.name) {
      await this.prisma_meta_insert('title', this.meta.name)
    }

    if (this.meta?.alias) {
      await this.prisma_meta_insert('subTitle', this.meta.alias)
    }

    if (this.meta?.description_text) {
      await this.prisma_meta_insert('describe', this.meta.description_text)
    }

    if (this.meta?.year) {
      await this.prisma_meta_insert(metaKeyType.publishDate, String(this.meta.year))
    }

    if (this.meta?.publisher) {
      await this.prisma_meta_insert(metaKeyType.publisher, this.meta.publisher)
    }

    if (this.meta?.status) {
      await this.prisma_meta_insert(metaKeyType.status, this.meta.status)
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
      },
    })
  }

  /**
   * 标签插入
   * @param tags
   */
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
   * 检查漫画是否有 smanga 元数据文件夹
   * @returns
   */
  smanga_meta_folder() {
    const dirOutExt = this.mangaRecord.mangaPath.replace(
      /(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i,
      ''
    )
    const baseName = path.basename(dirOutExt)
    const metaDir = path_meta()

    const dataMeta = path.join(
      metaDir,
      this.mangaRecord?.mediaName || '',
      baseName + '-smanga-info'
    )
    if (fs.existsSync(dataMeta)) {
      this.hasDataMeta = true
      return dataMeta
    }

    // 检查隐藏文件夹
    const hiddenFolder = path.join(this.mangaRecord.mangaPath, '.smanga')
    if (fs.existsSync(hiddenFolder)) {
      return hiddenFolder
    }

    // 检查 smanga-info 文件夹
    const dirMeta = dirOutExt + '-smanga-info'
    if (fs.existsSync(dirMeta)) {
      return dirMeta
    }

    return ''
  }

  /**
   * 复制封面到poster目录 使用单独任务队列
   * @param inputPath 源封面路径
   * @param outputPath 目标封面路径
   * @param maxSizeKB 压缩目标图片大小
   */
  copy_poster(inputPath: string, outputPath: string, maxSizeKB: number) {
    addTask({
      taskName: `reload_manga_meta${this.mangaRecord.mangaId}`,
      command: 'copyPoster',
      args: {
        inputPath,
        outputPath,
        maxSizeKB,
      },
      priority: TaskPriority.copyPoster,
      timeout: 1000 * 6,
    })
  }
}
