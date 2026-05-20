import { unzipFile } from '#utils/unzip'
import { extractRar } from '#utils/unrar'
import { extract7z } from '#utils/un7z'
import prisma from '#start/prisma'
import log from '#services/log_service'

export default class CompressChapterJob {
  chapterId: number
  chapterInfo: any
  chapterType: string
  chapterPath: string
  compressPath: string

  constructor({
    chapterId,
    chapterInfo,
    chapterType,
    chapterPath,
    compressPath,
  }: {
    chapterId: number
    chapterInfo: any
    chapterType: string
    chapterPath: string
    compressPath: string
  }) {
    this.chapterId = chapterId
    this.chapterInfo = chapterInfo
    this.chapterType = chapterType
    this.chapterPath = chapterPath
    this.compressPath = compressPath
  }

  public async run() {
    const start = Date.now()

    await log.info({
      type: 'compress',
      module: 'compress',
      action: 'chapter.compress.started',
      message: `chapter compress started: ${this.chapterPath}`,
      context: {
        chapterId: this.chapterId,
        chapterType: this.chapterType,
        chapterPath: this.chapterPath,
        compressPath: this.compressPath,
      },
    })

    try {
      switch (this.chapterType) {
        case 'zip':
          await unzipFile(this.chapterPath, this.compressPath)
          break
        case 'rar':
          await extractRar(this.chapterPath, this.compressPath)
          break
        case '7z':
          await extract7z(this.chapterPath, this.compressPath)
          break
        default:
          await log.warn({
            type: 'compress',
            module: 'compress',
            action: 'chapter.compress.unknown_type',
            message: `unknown compress type: ${this.chapterType}`,
            context: {
              chapterId: this.chapterId,
              chapterType: this.chapterType,
              chapterPath: this.chapterPath,
            },
          })
      }

      await prisma.compress.upsert({
        where: {
          chapterId: this.chapterId,
        },
        update: {
          compressStatus: 'compressed',
        },
        create: {
          chapterId: this.chapterId,
          mangaId: this.chapterInfo.mangaId,
          mediaId: this.chapterInfo.mediaId,
          chapterPath: this.chapterPath,
          compressPath: this.compressPath,
          compressType: this.chapterType,
          compressStatus: 'compressed',
        },
      })

      await log.info({
        type: 'compress',
        module: 'compress',
        action: 'chapter.compress.completed',
        message: `chapter compress completed: ${this.chapterPath}`,
        context: {
          chapterId: this.chapterId,
          chapterType: this.chapterType,
          chapterPath: this.chapterPath,
          compressPath: this.compressPath,
          durationMs: Date.now() - start,
        },
      })
    } catch (error: any) {
      await log.error({
        type: 'compress',
        module: 'compress',
        action: 'chapter.compress.failed',
        message: `chapter compress failed: ${this.chapterPath}`,
        error,
        awaitPersist: true,
        context: {
          chapterId: this.chapterId,
          chapterType: this.chapterType,
          chapterPath: this.chapterPath,
          compressPath: this.compressPath,
          durationMs: Date.now() - start,
        },
      })
      throw error
    }
  }
}