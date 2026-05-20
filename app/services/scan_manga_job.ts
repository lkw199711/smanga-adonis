import * as fs from 'fs'
import * as path from 'path'
import prisma from '#start/prisma'
import { Prisma } from '@prisma/client'
import {
  path_poster,
  path_cache,
  is_img,
  get_config,
  first_image,
  is_directory,
  extensions,
  metaImgKeys,
  path_meta,
} from '#utils/index'
import { S } from '../utils/convertText.js'
import { extract_cover, extract_metadata } from '#utils/unzip'
import { Unrar } from '#utils/unrar'
import { Un7z } from '#utils/un7z'
import { TaskPriority } from '../type/index.js'
import { addTask } from '#services/queue_service'
import { error_log, insert_manga_scan_log } from '#utils/log'
import { path as sqlPathType, media as sqlMediaType } from '@prisma/client'
import { metaKeyType } from '../type/index.js'
import { comicinfo_transform } from '#utils/meta'
import log from '#services/log_service'
type pathType = sqlPathType & { media: sqlMediaType }
const logModule = '[manga scan]'

export default class ScanMangaJob {
  private pathId: number
  private pathInfo: pathType | null | void = null
  private mediaRecord: sqlMediaType | null | void = null
  private mangaRecord: any
  private chapterRecord: any
  private mangaPath: string
  private mangaName: string
  private parentPath: string
  private cachePath: string = ''
  private nonNumericChapterCounter: number | null = null
  private meta: any = null
  // @ts-ignore - 淇濈暀浠ヤ究鍚庣画鎵弿蹇界暐闅愯棌鏂囦欢鐗规€т娇鐢?
  private ignoreHiddenFiles: boolean
  private tagColor: string
  private isCloudMedia: boolean = false
  private smangaMetaFolder: string = ''
  private hasDataMeta: boolean = false
  private alreadyExistManga: boolean = false
  private shouldSmangaMetaUpdate: boolean = true
  private shouldChapterUpdate: boolean = true

  constructor({
    pathId,
    mangaPath,
    mangaName,
    parentPath,
    isCloudMedia,
  }: {
    pathId: number
    pathInfo: any
    mediaRecord: any
    mangaPath: string
    mangaName: string
    parentPath: string
    isCloudMedia: boolean
  }) {
    this.pathId = pathId
    this.mangaPath = mangaPath
    this.mangaName = mangaName
    this.parentPath = parentPath || path.dirname(mangaPath)
    this.isCloudMedia = isCloudMedia

    const config = get_config()
    this.ignoreHiddenFiles = config.scan?.ignoreHiddenFiles === 1
    this.tagColor = config.scan?.defaultTagColor || '#a0d911'
  }

  private normalize_scan_path(filePath: string | null | undefined) {
    return filePath ? path.normalize(filePath) : ''
  }

  async run() {
    const pathId = this.pathId
    await log.info({
      type: 'scan',
      module: 'scan',
      action: 'manga.run.started',
      message: `scan manga started: ${this.mangaName}`,
      context: {
        pathId,
        mangaPath: this.mangaPath,
        mangaName: this.mangaName,
        parentPath: this.parentPath,
      },
    })

    this.pathInfo = await prisma.path
      .findUnique({ where: { pathId }, include: { media: true } })
      .catch(async (e) => {
        await error_log(logModule, e.message)
      })
    this.mediaRecord = this.pathInfo?.media
    const mangaPath = this.mangaPath
    const mangaName = this.mangaName
    const parentPath = this.parentPath
    const reloadCover = get_config()?.scan?.reloadCover ?? 0

    if (!this.pathInfo) {
      await log.warn({
        type: 'scan',
        module: 'scan',
        action: 'manga.run.failed',
        message: `scan manga failed: path missing (${pathId})`,
        context: {
          pathId,
          mangaPath,
          mangaName,
          reason: 'path_not_found',
        },
      })
      await error_log(logModule, `pathId ${pathId} 路径不存在`)
      return
    }

    if (!this.mediaRecord) {
      await log.warn({
        type: 'scan',
        module: 'scan',
        action: 'manga.run.failed',
        message: `scan manga failed: media missing (${pathId})`,
        context: {
          pathId,
          mangaPath,
          mangaName,
          reason: 'media_not_found',
        },
      })
      error_log(logModule, `pathId ${pathId}濯掍綋搴撲笉瀛樺湪`)
      return
    }

    this.cachePath = path_cache()

    // 妫€鏌ユ极鐢绘槸鍚︽湁 smanga 鍏冩暟鎹枃浠跺す
    this.smangaMetaFolder = this.smanga_meta_folder()

    // 鏇存柊璺緞鎵弿鏃堕棿
    await prisma.path
      .update({ where: { pathId }, data: { lastScanTime: new Date() } })
      .catch(async (e) => {
        await error_log(logModule, e.message)
      })

    let mangaInsert: Prisma.mangaCreateInput

    // 鍒ゆ柇鍚嶇О鏄惁鏈変腑鏂?灏嗘爣棰樼箒绠€浣撹浆鎹㈠悗鍐欏叆鍓爣棰?鐢ㄤ簬妫€绱?
    let subTitle = mangaName
    if (/[\u4e00-\u9fa5]/.test(mangaName)) {
      const sName = S.t2s(mangaName)
      const tName = S.s2t(mangaName)
      subTitle = `${sName}/${tName}`
    }

    // 婕敾鎻掑叆鏁版嵁
    mangaInsert = {
      media: {
        connect: {
          mediaId: this.mediaRecord.mediaId,
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
      browseType: this.mediaRecord.browseType,
      chapterCount: 1,
      mangaNumber: this.manga_number(mangaName),
    }

    // 妫€鏌ュ簱涓槸鍚﹀瓨鍦ㄦ婕敾
    this.mangaRecord = await prisma.manga.findFirst({
      where: {
        AND: [{ mangaPath }, { mediaId: this.pathInfo.mediaId }],
      },
    })

    if (this.mangaRecord) {
      this.alreadyExistManga = true
      this.shouldSmangaMetaUpdate = await this.should_smanga_meta_update()
      this.shouldChapterUpdate = await this.should_chapter_update()
    }

    if (this.mediaRecord.mediaType == 1) {
      /**
       * 褰撴极鐢荤被鍨嬩负鍗曟湰婕敾
       */

      // 婕敾宸插瓨鍦?璺宠繃姝ゆ极鐢?
      if (this.mangaRecord) {
        // 濡傛灉婕敾宸茶鏍囪涓哄垹闄?鍒欐仮澶嶆极鐢?
        if (this.mangaRecord.deleteFlag) {
          await prisma.manga.update({
            where: { mangaId: this.mangaRecord.mangaId },
            data: { deleteFlag: 0 },
          })
        }
        return
      }

      mangaInsert.chapterCount = 1

      this.mangaRecord = await prisma.manga.create({ data: mangaInsert })

      // 鎵弿鍏冩暟鎹?
      await this.meta_scan()
      await this.meta_scan_series()

      // 鏇存柊婕敾灏侀潰
      if (!this.mangaRecord.mangaCover || this.shouldSmangaMetaUpdate || reloadCover) {
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
            mediaId: this.mediaRecord.mediaId,
          },
        },
        pathId,
        chapterName: mangaName,
        chapterPath: mangaPath,
        browseType: this.mediaRecord.browseType,
        subTitle: subTitle,
        chapterType: this.compress_type(mangaPath),
      }

      this.chapterRecord = await prisma.chapter.create({ data: chapterInsert })
      if (!this.chapterRecord) {
        void log.warn({
          type: 'scan',
          module: 'scan',
          action: 'chapter.insert.empty_result',
          message: '绔犺妭鎻掑叆澶辫触',
          context: { mangaName, mangaPath, pathId },
        })
        return
      }

      // 鑾峰彇灏侀潰鍥?
      if (!this.chapterRecord.chapterCover || reloadCover) {
        await this.chapter_poster(mangaPath)
      }

      // 鎵弿鍏冩暟鎹?
      await this.meta_scan_comicinfo()

      // 璁叉极鐢绘壂鎻忔垚鏋滃啓鍏ユ棩蹇?
      await insert_manga_scan_log({
        mangaId: this.mangaRecord.mangaId,
        mangaName: this.mangaRecord.mangaName,
        newChapters: 1,
      })
    } else {
      /**
       * 褰撴极鐢荤被鍨嬩负杩炶浇婕敾
       */

      // 搴撲腑涓嶅瓨鍦ㄥ垯鏂板
      if (!this.mangaRecord) {
        this.mangaRecord = await prisma.manga.create({ data: mangaInsert })
      }

      // 鎵弿鍏冩暟鎹?
      await this.meta_scan()
      await this.meta_scan_series()
      
       if (!this.mangaRecord.mangaCover || this.shouldSmangaMetaUpdate || reloadCover) {
         await this.manga_poster(mangaPath)
       }

      // 婕敾鏈洿鏂?
      if (!this.shouldChapterUpdate) {
        return
      }

      // 鎵弿鐩綍缁撴瀯鑾峰彇绔犺妭鍒楄〃
      let chapterList = await this.scan_path(mangaPath)
      let chapterListSql: any = await prisma.chapter.findMany({
        where: { mangaId: this.mangaRecord.mangaId },
      })

      // 濡傛灉婕敾宸茶鏍囪涓哄垹闄?鍒欐仮澶嶆极鐢?
      if (this.mangaRecord.deleteFlag) {
        await prisma.manga.update({
          where: { mangaId: this.mangaRecord.mangaId },
          data: { deleteFlag: 0 },
        })
      }

      const newChapterList = chapterList.filter((item: any) => {
        return !chapterListSql.some(
          (sqlItem: any) =>
            this.normalize_scan_path(sqlItem.chapterPath) ===
            this.normalize_scan_path(item.chapterPath)
        )
      })
      const delChapterList = chapterListSql.filter((item: any) => {
        return !chapterList.some(
          (scanItem: any) =>
            this.normalize_scan_path(scanItem.chapterPath) ===
            this.normalize_scan_path(item.chapterPath)
        )
      })

      for (let index = 0; index < newChapterList.length; index++) {
        const item = newChapterList[index]
        // 妫€娴嬫湁鏃犱腑鏂?灏嗘爣棰樼箒绠€浣撹浆鎹㈠悗鍐欏叆鍓爣棰?鐢ㄤ簬妫€绱?
        let subTitle = item.chapterName
        if (/[\u4e00-\u9fa5]/.test(item.chapterName)) {
          const sName = S.t2s(item.chapterName)
          const tName = S.s2t(item.chapterName)
          subTitle = `${sName}/${tName}`
        }

        const chapterInsert: Prisma.chapterCreateInput = {
          manga: {
            connect: {
              mangaId: this.mangaRecord.mangaId,
            },
          },
          media: {
            connect: {
              mediaId: this.mediaRecord.mediaId,
            },
          },
          pathId,
          chapterName: item.chapterName,
          chapterPath: item.chapterPath,
          browseType: this.mediaRecord.browseType,
          subTitle: subTitle,
          chapterType: this.compress_type(item.chapterPath),
          chapterNumber: this.chapter_index(item.chapterName),
        }

        try {
          this.chapterRecord = await prisma.chapter.create({ data: chapterInsert })
        } catch (e) {
          void log.error({
            type: 'scan',
            module: 'scan',
            action: 'chapter.insert.failed',
            message: `绔犺妭鎻掑叆澶辫触: ${item.chapterName}`,
            error: e,
            context: { chapterName: item.chapterName, chapterPath: item.chapterPath, pathId },
          })

          return
        }

        // 鑾峰彇灏侀潰鍥?
        if (!this.chapterRecord.chapterCover || reloadCover) {
          await this.chapter_poster(item.chapterPath)
        }

        // 鎵弿鍏冩暟鎹?
        await this.meta_scan_comicinfo()
      }

      for (let index = 0; index < delChapterList.length; index++) {
        const element = delChapterList[index]
        await prisma.chapter.delete({ where: { chapterId: element.chapterId } })
      }

      if (newChapterList.length || delChapterList.length) {
        // 鏇存柊婕敾鏇存柊鏃堕棿
        await prisma.manga.update({
          data: { updateTime: new Date() },
          where: { mangaId: this.mangaRecord.mangaId },
        })
      }

      // 璁叉极鐢绘壂鎻忔垚鏋滃啓鍏ユ棩蹇?
      if (newChapterList.length) {
        await insert_manga_scan_log({
          mangaId: this.mangaRecord.mangaId,
          mangaName: this.mangaRecord.mangaName,
          newChapters: newChapterList.length,
        })
      }

      if (delChapterList.length) {
        await insert_manga_scan_log({
          mangaId: this.mangaRecord.mangaId,
          mangaName: this.mangaRecord.mangaName,
          newChapters: delChapterList.length * -1,
        })
      }

      if (!newChapterList.length && !delChapterList.length) {
        await insert_manga_scan_log({
          mangaId: this.mangaRecord.mangaId,
          mangaName: this.mangaRecord.mangaName,
          newChapters: 0,
        })
      }
      // 鏇存柊绔犺妭鏁伴噺
      await prisma.manga.update({
        where: { mangaId: this.mangaRecord.mangaId },
        data: { chapterCount: chapterList.length },
      })

      // 鏇存柊婕敾鏇存柊鏃堕棿 褰撲笖浠呭綋绔犺妭鏁伴噺澧炲姞鏃?
      if (this.mangaRecord?.chapterCount && chapterList.length > this.mangaRecord.chapterCount) {
        await prisma.manga.update({
          where: { mangaId: this.mangaRecord.mangaId },
          data: { chapterUpdate: new Date() },
        })
      }
    }
  }

  /**
   * 鍒ゆ柇鏄惁闇€瑕佹洿鏂板厓鏁版嵁
   * @returns 鏄惁闇€瑕佹洿鏂板厓鏁版嵁
   */
  async should_smanga_meta_update() {
    // 娌℃湁鍏冩暟鎹枃浠跺す 鍒欎笉闇€瑕佹洿鏂板厓鏁版嵁
    if (!this.smangaMetaFolder) return false

    // 鑾峰彇鏈€鏂癿eta鐨勬洿鏂版椂闂?
    const latestMeta = await prisma.meta.findFirst({
      where: {
        mangaId: this.mangaRecord.mangaId,
      },
      orderBy: {
        updateTime: 'desc',
      },
    })

    // 娌℃湁鏈€鏂癿eta 鍒欓渶瑕侀噸鏂版壂鎻?
    if (!latestMeta) return true

    // 濡傛灉鏈€鏂癿eta鐨勬洿鏂版椂闂?澶т簬 meta鏂囦欢澶规洿鏂版椂闂?鍒欎笉闇€瑕侀噸鏂版壂鎻?
    if (latestMeta) {
      const latestMetaUpdateTime = latestMeta.updateTime
      const smangaMetaFolderUpdateTime = fs.statSync(this.smangaMetaFolder).mtime
      return smangaMetaFolderUpdateTime > latestMetaUpdateTime
    }

    // 娌℃湁鏈€鏂癿eta 鍒欓渶瑕侀噸鏂版壂鎻?
    return true
  }

  /**
   * 鍒ゆ柇鏄惁闇€瑕佹洿鏂扮珷鑺?
   * @returns 鏄惁闇€瑕佹洿鏂扮珷鑺?
   */
  async should_chapter_update() {
    // 鑾峰彇鏈€鏂扮珷鑺傜殑鏇存柊鏃堕棿
    const latestChapter = await prisma.chapter.findFirst({
      where: {
        mangaId: this.mangaRecord.mangaId,
      },
      orderBy: {
        updateTime: 'desc',
      },
    })

    // 濡傛灉鏈€鏂扮珷鑺傜殑鏇存柊鏃堕棿 澶т簬 绔犺妭鏂囦欢澶规洿鏂版椂闂?鍒欎笉闇€瑕侀噸鏂版壂鎻?
    if (latestChapter) {
      const latestChapterUpdateTime = latestChapter.updateTime
      if (!fs.existsSync(this.mangaRecord.mangaPath)) {
        throw new Error('漫画路径不存在')
      }
      const mangaFolderUpdateTime = fs.statSync(this.mangaRecord.mangaPath).mtime
      return mangaFolderUpdateTime > latestChapterUpdateTime
    }

    // 娌℃湁鏈€鏂扮珷鑺?鍒欓渶瑕侀噸鏂版壂鎻?
    return true
  }

  /**
   *
   * @param recasn 鏄惁閲嶆柊鎵弿鍏冩暟鎹?
   * @returns
   */
  async meta_scan() {
    // 浜戠洏搴撳繀椤绘壂鎻忔棦鏈夌紦瀛樺厓鏁版嵁 鍚﹀垯涓嶆墽琛?
    if (this.alreadyExistManga && this.isCloudMedia && !this.hasDataMeta) return false

    // 娌℃湁鍏冩暟鎹枃浠?
    if (!this.smangaMetaFolder) return false

    // 鍒ゆ柇鏄惁闇€瑕佹洿鏂板厓鏁版嵁
    if (!this.shouldSmangaMetaUpdate) return false

    const dirMeta = this.smangaMetaFolder

    // 鍒犻櫎鍘熸湁鐨勫厓鏁版嵁
    await this.clear_manga_meta()

    const infoFile = path.join(dirMeta, 'info.json')
    const metaFile = path.join(dirMeta, 'meta.json')
    // 涓哄吋瀹硅€佺殑鍏冩暟鎹枃浠?鍏佽鏂囦欢鍚嶄负info
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
      // 涓€鑸€у厓鏁版嵁
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
            void log.warn({
              type: 'scan',
              module: 'scan',
              action: 'meta.insert.failed',
              message: 'insert manga metadata failed',
              error: e,
              context: { mangaId: this.mangaRecord?.mangaId, metaName: key },
            })
          }
        }
      }

      // 鎻掑叆鏍囩
      const tags: string[] = info?.tags || []
      await this.tag_insert(tags)

      // banner,thumbnail,character
      const metaFiles = fs.readdirSync(dirMeta)
      const characters = info?.character || []

      for (let index = 0; index < metaFiles.length; index++) {
        const file = metaFiles[index]
        const filePath = path.join(dirMeta, file)
        if (!is_img(file)) continue

        // 鑾峰彇涓嶅甫鎵╁睍鍚嶇殑鍩虹鍚嶇О
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

      // 鏇存柊绔犺妭椤哄簭
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
   * 妫€鏌ユ极鐢绘槸鍚︽湁 smanga 鍏冩暟鎹枃浠跺す
   * @returns
   */
  smanga_meta_folder() {
    const dirOutExt = this.mangaPath.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
    const baseName = path.basename(dirOutExt)
    const metaDir = path_meta()

    const dataMetaHidden = path.join(
      metaDir,
      this.mediaRecord?.mediaName || '',
      baseName,
      '.smanga'
    )
    if (fs.existsSync(dataMetaHidden)) {
      this.hasDataMeta = true
      return dataMetaHidden
    }

    const dataMeta = path.join(
      metaDir,
      this.mediaRecord?.mediaName || '',
      baseName + '-smanga-info'
    )
    if (fs.existsSync(dataMeta)) {
      this.hasDataMeta = true
      return dataMeta
    }

    // 妫€鏌ラ殣钘忔枃浠跺す
    const hiddenFolder = path.join(this.mangaPath, '.smanga')
    if (fs.existsSync(hiddenFolder)) {
      return hiddenFolder
    }

    // 妫€鏌?smanga-info 鏂囦欢澶?
    const dirMeta = dirOutExt + '-smanga-info'
    if (fs.existsSync(dirMeta)) {
      return dirMeta
    }

    return ''
  }

  /**
   * 鎵弿 series.json 鍏冩暟鎹?
   * @returns
   */
  async meta_scan_series() {
    // 婕敾涓簊manga瀹氬埗鏍煎紡 涓嶆壂鎻?series.json
    if (this.smangaMetaFolder) return false
    // 浜戞极鐢讳笉鎵弿 series.json
    if (this.isCloudMedia) return
    const mangaPath = this.mangaRecord.mangaPath
    if (!is_directory(mangaPath)) return

    const fils = fs.readdirSync(mangaPath)
    const series = fils.find((file) => file === 'series.json')
    if (!series) return

    // 鍒犻櫎鍘熸湁鐨勫厓鏁版嵁
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
   * 娓呴櫎婕敾鍏冩暟鎹?
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
   * 娓呴櫎绔犺妭鍏冩暟鎹?
   */
  async clear_chapter_meta() {
    await prisma.meta.deleteMany({
      where: {
        mangaId: this.mangaRecord.mangaId,
        chapterId: this.chapterRecord.chapterId,
      },
    })
  }

  async tag_insert(tags: any[]) {
    for (let tag of tags) {
      // 绯荤粺鏍囩淇濇寔鍞竴鎬?鐢ㄦ埛鏍囩涓嶅仛鍞竴鎬ч檺鍒?
      // 鎵弿鏃剁‘璁ゆ病鏈夊悓鍚嶇郴缁熸爣绛?娌℃湁鍒欏垱寤?
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
            void log.warn({
              type: 'scan',
              module: 'scan',
              action: 'tag.insert.failed',
              message: '鏍囩鎻掑叆澶辫触',
              error: e,
              context: {
                mangaId: this.mangaRecord?.mangaId,
                tagId: tagRecord?.tagId,
                tagName: tag,
              },
            })
          })
      }
    }
  }

  /**
   * 鍚戞暟鎹簱涓彃鍏ュ厓鏁版嵁
   * @param key 鍏冩暟鎹悕绉?
   * @param value 鍏冩暟鎹€?
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
   * 鎵弿鐩綍鑾峰彇绔犺妭鍒楄〃
   * @param dir 鐩綍璺緞
   * @returns 绔犺妭鍒楄〃
   */
  async scan_path(dir: string) {
    // 检查是否为目录
    if (!fs.statSync(dir).isDirectory()) {
      void log.warn({
        type: 'scan',
        module: 'scan',
        action: 'scan_path.invalid_directory',
        message: '鎸囧畾闈炵洰褰曟枃浠?璇锋鏌?濯掍綋搴撶被鍨?璁剧疆',
        context: { dir },
      })
      return []
    }

    let folderList = fs.readdirSync(dir)
    let chapterList: any = []

    folderList = folderList.filter((item) => {
      // 鎺掗櫎. .. 鏂囦欢澶?
      if (item === '.' || item === '..') {
        return false
      }

      // 鎺掗櫎闅愯棌鏂囦欢
      if (this.ignoreHiddenFiles && /^\./.test(item)) {
        return false
      }

      return true
    })

    folderList.forEach((item) => {
      const itemPath = path.join(dir, item)
      const fileName = item
      // 鏂囦欢澶圭珷鑺?鍏ㄥ悕浣滀负绔犺妭鍚?
      let chapterName = fileName
      const chapterPath = itemPath

      // 濡傛灉涓嶆槸鐩綍
      let type = 'img'
      if (!fs.statSync(itemPath).isDirectory()) {
        // 鏂囦欢绔犺妭 鑾峰彇鍏跺熀纭€鍚嶇О浣滀负绔犺妭鍚?
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

  /**
   * 鎵弿绔犺妭灏侀潰
   * @param dir 绔犺妭鐩綍
   * @returns 灏侀潰璺緞
   */
  async chapter_poster(dir: string) {
    const posterPath = path_poster()
    // 涓洪槻姝ar鍖呭唴榛樿鐨勬枃浠跺悕涓巆hapterId閲嶅悕,鍔犲叆鐗瑰畾鍓嶇紑
    let posterName = `${posterPath}/smanga_chapter_${this.chapterRecord.chapterId}.jpg`
    // 鍘嬬缉鐩爣鍥剧墖澶у皬
    const maxSizeKB = get_config()?.compress?.poster || 300
    // 鏄惁鍦ㄥ帇缂╁寘鍐呮壘鍒板皝闈?
    let hasPosterInZip = false
    let hasMetaChapterCover = false
    // 婧愬皝闈?
    let sourcePoster = ''
    // 妫€绱㈠钩绾х洰褰曞皝闈㈠浘鐗?
    const dirOutExt = dir.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')

    if (this.isCloudMedia) {
      const metaChapterCover = path.join(
        '/data/meta',
        this.mediaRecord?.mediaName || '',
        this.mangaName,
        this.chapterRecord.chapterName + '.jpg'
      )
      const metaChapterCover2 = path.join(
        this.smangaMetaFolder,
        'chapter-cover.jpg'
      )
      // 鍚岀骇鍒洰褰曞皝闈?
      const sidePoster = dirOutExt + '.jpg'
      // 婕敾鏂囦欢澶瑰唴閮ㄥ皝闈?
      const picPath = path.join(dir, 'cover.jpg')

      if (fs.existsSync(metaChapterCover)) {
        hasMetaChapterCover = true
        sourcePoster = metaChapterCover
      } else if (fs.existsSync(metaChapterCover2)) {
        hasMetaChapterCover = true
        sourcePoster = metaChapterCover2
      } else if (fs.existsSync(sidePoster)) {
        sourcePoster = sidePoster
      } else if (fs.existsSync(picPath)) {
        sourcePoster = picPath
      } else {
        // 杩欏嚑绉嶉兘娌℃湁,缃戠洏搴撲笉鍐嶆娴嬪叾浠栧皝闈?
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

    // 閮芥病鏈夋壘鍒拌繑鍥炵┖
    if (!this.isCloudMedia && !sourcePoster && this.chapterRecord.chapterType === 'img') {
      sourcePoster = first_image(dir)
    }

    if (
      !this.isCloudMedia &&
      !sourcePoster &&
      ['zip', 'rar', '7z'].includes(this.chapterRecord.chapterType)
    ) {
      // 瑙ｅ帇缂╄幏鍙栧皝闈?
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

    // 鏈壘鍒板皝闈?
    if (!sourcePoster) return ''

    // 涓嶅鍒跺皝闈?鐩存帴浣跨敤婧愭枃浠?缃戠洏搴撳繀椤籧opy灏侀潰
    const copyPoster =
      // 鍘嬬缉鍖呭唴鏈夊皝闈?
      hasPosterInZip ||
      // 浜戠洏搴?涓旀病鏈夌Щ妞嶅厓鏁版嵁
      (this.isCloudMedia && !hasMetaChapterCover) ||
      // 灏侀潰杩囧ぇ闇€瑕佸帇缂?
      fs.statSync(sourcePoster).size > maxSizeKB * 1024

    // 鍐欏叆婕敾涓庣珷鑺傚皝闈?
    await prisma.chapter.update({
      where: { chapterId: this.chapterRecord.chapterId },
      data: { chapterCover: copyPoster ? posterName : sourcePoster },
    })
    this.chapterRecord.chapterCover = copyPoster ? posterName : sourcePoster

    if (!this.mangaRecord.mangaCover) {
      // 鐩存帴浣跨敤update鐨勮繑鍥炲€间細涓㈠けid 鎵嶇敤琛ュ厖璧嬪€肩殑褰㈠紡琛ュ叏鏁版嵁
      await prisma.manga.update({
        where: { mangaId: this.mangaRecord.mangaId },
        data: { mangaCover: copyPoster ? posterName : sourcePoster },
      })
      this.mangaRecord.mangaCover = copyPoster ? posterName : sourcePoster
    }

    // 澶嶅埗灏侀潰鍒皃oster鐩綍 浣跨敤鍗曠嫭浠诲姟闃熷垪
    if (copyPoster) {
      this.copy_poster(sourcePoster, posterName, maxSizeKB)
    }

    return copyPoster ? posterName : sourcePoster
  }

  /**
   * 鎵弿婕敾灏侀潰
   * @param dir 婕敾鐩綍
   * @returns 灏侀潰璺緞
   */
  async manga_poster(dir: string) {
    const posterPath = path_poster()
    // 涓洪槻姝ar鍖呭唴榛樿鐨勬枃浠跺悕涓巆hapterId閲嶅悕,鍔犲叆鐗瑰畾鍓嶇紑
    const posterName = `${posterPath}/smanga_manga_${this.mangaRecord.mangaId}.jpg`
    // 鍘嬬缉鐩爣鍥剧墖澶у皬
    const maxSizeKB = get_config()?.compress?.poster ?? 300
    // 婧愬皝闈?
    let sourcePoster = ''
    const dirOutExt = dir.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')

    // 濡傛灉鏄綉鐩樺簱 绠€鍖栧皝闈㈡绱㈤€昏緫
    if (this.isCloudMedia) {
      // 鍏冩暟鎹皝闈?
      const metaMangaCover = path.join(this.smangaMetaFolder, 'cover.jpg')
      // 鍚岀骇鍒洰褰曞皝闈?
      const sidePoster = dirOutExt + '.jpg'
      // 婕敾鏂囦欢澶瑰唴閮ㄥ皝闈?
      const picPath = path.join(dir, 'cover.jpg')
      if (fs.existsSync(metaMangaCover)) {
        sourcePoster = metaMangaCover
      } else if (fs.existsSync(sidePoster)) {
        sourcePoster = sidePoster
      } else if (fs.existsSync(picPath)) {
        // 婕敾鏂囦欢澶瑰唴閮ㄥ皝闈?
        sourcePoster = picPath
      } else {
        // 杩欏嚑鏍烽兘娌℃湁 缃戠洏搴撲笉鍐嶆娴嬪叾浠栫被鍨嬬殑灏侀潰
        return ''
      }
    }

    // 妫€绱㈠厓鏁版嵁鐩綍灏侀潰鍥剧墖
    if (!sourcePoster && fs.existsSync(this.smangaMetaFolder)) {
      extensions.some((ext) => {
        const picPath = path.join(this.smangaMetaFolder, 'cover' + ext)
        if (fs.existsSync(picPath)) {
          sourcePoster = picPath
          return true
        }
      })
    }

    // 妫€绱㈠钩绾х洰褰曞皝闈㈠浘鐗?
    if (!sourcePoster) {
      extensions.some((ext) => {
        const picPath = dirOutExt + ext
        if (fs.existsSync(picPath)) {
          sourcePoster = picPath
          return true
        }
      })
    }

    // 妫€绱㈡极鐢绘枃浠跺す鍐呯殑灏侀潰鍥剧墖
    if (
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

    if (!sourcePoster) return ''

    // 涓嶅鍒跺皝闈?鐩存帴浣跨敤婧愭枃浠?
    // 缃戠洏搴撳繀椤籧opy灏侀潰
    // 鎴栬€呭皝闈㈠お澶ч渶瑕佸帇缂?
    const copyPoster =
      (this.isCloudMedia && !this.hasDataMeta) || fs.statSync(sourcePoster).size > maxSizeKB * 1024

    await prisma.manga.update({
      where: { mangaId: this.mangaRecord.mangaId },
      data: { mangaCover: copyPoster ? posterName : sourcePoster },
    })
    this.mangaRecord.mangaCover = copyPoster ? posterName : sourcePoster

    // 澶嶅埗灏侀潰鍒皃oster鐩綍 浣跨敤鍗曠嫭浠诲姟闃熷垪
    if (copyPoster) {
      this.copy_poster(sourcePoster, posterName, maxSizeKB)
    }

    return copyPoster ? posterName : sourcePoster
  }

  /**
   * 澶嶅埗灏侀潰鍒皃oster鐩綍 浣跨敤鍗曠嫭浠诲姟闃熷垪
   * @param inputPath 婧愬皝闈㈣矾寰?
   * @param outputPath 鐩爣灏侀潰璺緞
   * @param maxSizeKB 鍘嬬缉鐩爣鍥剧墖澶у皬
   */
  copy_poster(inputPath: string, outputPath: string, maxSizeKB: number) {
    addTask({
      taskName: `scan_path_${this.pathId}`,
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

  /**
   * 鎵弿comicinfo鍏冩暟鎹?
   * @returns
   */
  async meta_scan_comicinfo() {
    // 婕敾涓簊manga瀹氬埗鏍煎紡 涓嶆壂鎻?comicinfo
    if (this.smangaMetaFolder) return false
    // 浜戞极鐢讳笉鎵弿 comicinfo
    if (this.isCloudMedia) return
    if (this.chapterRecord.chapterType !== 'zip') {
      return
    }

    const comicinfo = await extract_metadata(this.chapterRecord.chapterPath)

    if (!comicinfo) return

    // 鍒犻櫎鍘熸湁鐨勫厓鏁版嵁
    await this.clear_chapter_meta()

    const metaData = comicinfo_transform(comicinfo)
    await this.insert_meta(metaData)
    await this.tag_insert(metaData.tags)
  }

  /**
   * 鎻掑叆鍏冩暟鎹?
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

  compress_type(filePath: string) {
    // 妫€鏌ユ槸鍚︿负鐩綍
    if (fs.statSync(filePath).isDirectory()) return 'img'

    // 鑾峰彇灏忓啓鐨勬枃浠舵墿灞曞悕
    const ext = path.extname(filePath).toLowerCase()

    // 浣跨敤瀵硅薄鏄犲皠鎵╁睍鍚嶅埌绫诲瀷
    const typeMapping: any = {
      '.cbr': 'zip',
      '.cbz': 'zip',
      '.zip': 'zip',
      '.epub': 'zip',
      '.rar': 'rar',
      '.7z': '7z',
      '.pdf': 'pdf',
    }

    // 杩斿洖瀵瑰簲绫诲瀷锛屽鏋滄病鏈夊尮閰嶏紝榛樿杩斿洖 'img'
    return typeMapping[ext] || 'img'
  }

  chapter_number(chapterName: string, width: number = 5) {
    // 浣跨敤姝ｅ垯琛ㄨ揪寮忓尮閰嶆暟瀛楅儴鍒嗗強鍏跺悗闈㈠彲鑳界殑绗﹀彿 (., -, _)
    const match = chapterName.match(/(\d+[\.\-_]*\d*)/)

    if (!match) {
      // 濡傛灉娌℃湁鍖归厤鍒版暟瀛楅儴鍒嗭紝涓洪潪鏁板瓧绔犺妭鍒嗛厤涓€涓€掑鐨勫€?
      if (this.nonNumericChapterCounter === null) {
        // 鐢熸垚鍒濆鍊?(90, 900, 9000, ...)
        this.nonNumericChapterCounter = parseInt('9'.padEnd(width, '0'))
      }
      const nonNumericValue = (this.nonNumericChapterCounter++).toString()

      return nonNumericValue.padStart(width, '0')
    }

    const [_, numPart] = match

    // 灏嗘暟瀛楅儴鍒嗚繘琛岃ˉ浣嶏紝淇濈暀绗﹀彿閮ㄥ垎
    const paddedNumPart = numPart.replace(/^(\d+)/, (match) => match.padStart(width, '0'))

    return paddedNumPart
  }

  manga_number(mangaName: string, width: number = 3) {
    // 浣跨敤姝ｅ垯琛ㄨ揪寮忓尮閰嶆暟瀛楅儴鍒嗗強鍏跺悗闈㈠彲鑳界殑绗﹀彿 (., -, _)
    const match = mangaName.match(/(\d+[\.\-_]*\d*)/)

    if (!match) {
      return ''
    }

    const [_, numPart] = match

    // 灏嗘暟瀛楅儴鍒嗚繘琛岃ˉ浣嶏紝淇濈暀绗﹀彿閮ㄥ垎
    const paddedNumPart = numPart.replace(/^(\d+)/, (match) => match.padStart(width, '0'))

    return paddedNumPart
  }

  isDirectory(filePath: string) {
    try {
      const stats = fs.statSync(filePath)
      return stats.isDirectory()
    } catch (err) {
      // 濡傛灉璺緞涓嶅瓨鍦ㄦ垨鍏朵粬閿欒锛岃繑鍥?false
      return false
    }
  }

  chapter_index(chapterName: string) {
    if (!this.meta?.chapters) return this.chapter_number(chapterName)

    const chapterIndex = this.meta.chapters.findIndex((chapter: any) =>
      [chapter?.chapterName, chapter?.name, chapter.title].includes(chapterName)
    )

    return chapterIndex === -1
      ? this.chapter_number(chapterName)
      : chapterIndex.toString().padStart(5, '0')
  }
}

