import * as fs from 'fs'
import * as path from 'path'
import { download_file, syncApi } from '#utils/api'
import { chapter as chapterPrismaType } from '@prisma/client'
import log from '#services/log_service'

type chapterType = chapterPrismaType & { outCovers?: string[] }

export default class SyncChapterJob {
  private localMangaPath: string = ''
  private localChapterPath: string = ''
  private targetChapterRecord: chapterType | null
  private origin: string = ''

  constructor({
    localMangaPath,
    targetChapterRecord,
    origin,
  }: {
    localMangaPath: string
    targetChapterRecord: chapterType
    origin: string
  }) {
    this.targetChapterRecord = targetChapterRecord
    this.localMangaPath = localMangaPath
    this.origin = origin
  }

  async run() {
    await log.info({
      type: 'sync',
      module: 'sync',
      action: 'sync.chapter.started',
      message: 'sync chapter started',
      context: {
        localMangaPath: this.localMangaPath,
        chapterId: this.targetChapterRecord?.chapterId,
        chapterName: this.targetChapterRecord?.chapterName,
        origin: this.origin,
      },
    })

    try {
      if (!this.targetChapterRecord) {
        await log.warn({
          type: 'sync',
          module: 'sync',
          action: 'sync.chapter.target.missing',
          message: 'sync chapter failed: target chapter missing',
          context: {
            localMangaPath: this.localMangaPath,
            origin: this.origin,
          },
        })
        return
      }

      if (this.targetChapterRecord.outCovers) {
        for (let i = 0; i < this.targetChapterRecord.outCovers.length; i++) {
          const cover = this.targetChapterRecord.outCovers[i]
          const basename = path.basename(cover)
          const localPath = path.join(this.localMangaPath, basename)
          if (!fs.existsSync(localPath)) {
            await download_file(this.origin, cover, localPath)
          }
        }
      }

      if (this.targetChapterRecord.chapterType === 'img') {
        this.localChapterPath = path.join(this.localMangaPath, this.targetChapterRecord.chapterName)
        if (!fs.existsSync(this.localChapterPath)) {
          fs.mkdirSync(this.localChapterPath)
        }

        const imagesResponse = await syncApi.images(this.origin, this.targetChapterRecord.chapterId)
        const images = imagesResponse.list || []

        for (const image of images) {
          const basename = path.basename(image)
          const localPath = path.join(this.localChapterPath, basename)
          if (!fs.existsSync(localPath)) {
            await download_file(this.origin, image, localPath)
          }
        }

        await log.info({
          type: 'sync',
          module: 'sync',
          action: 'sync.chapter.completed',
          message: `sync chapter image mode completed: ${this.targetChapterRecord.chapterName}`,
          context: {
            chapterId: this.targetChapterRecord.chapterId,
            chapterName: this.targetChapterRecord.chapterName,
            imageCount: images.length,
            localChapterPath: this.localChapterPath,
          },
        })
        return
      }

      const basename = path.basename(this.targetChapterRecord.chapterPath)
      this.localChapterPath = path.join(this.localMangaPath, basename)
      if (!fs.existsSync(this.localChapterPath)) {
        await download_file(this.origin, this.targetChapterRecord.chapterPath, this.localChapterPath)
      }

      await log.info({
        type: 'sync',
        module: 'sync',
        action: 'sync.chapter.completed',
        message: `sync chapter archive mode completed: ${this.targetChapterRecord.chapterName}`,
        context: {
          chapterId: this.targetChapterRecord.chapterId,
          chapterName: this.targetChapterRecord.chapterName,
          chapterType: this.targetChapterRecord.chapterType,
          localChapterPath: this.localChapterPath,
        },
      })
    } catch (error: any) {
      await log.error({
        type: 'sync',
        module: 'sync',
        action: 'sync.chapter.failed',
        message: 'sync chapter failed',
        error,
        context: {
          localMangaPath: this.localMangaPath,
          localChapterPath: this.localChapterPath,
          chapterId: this.targetChapterRecord?.chapterId,
          chapterName: this.targetChapterRecord?.chapterName,
          chapterType: this.targetChapterRecord?.chapterType,
          origin: this.origin,
          remoteStatus: error?.response?.status,
          remoteMessage: error?.response?.data?.message,
          remoteData: error?.response?.data,
        },
      })
      throw error
    }
  }
}