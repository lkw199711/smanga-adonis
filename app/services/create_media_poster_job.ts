import prisma from '#start/prisma'
import { path_poster } from '#utils/index'
import sharp from 'sharp'
import * as path from 'path'
import fs from 'fs'
import { error_log, media_cover_log } from '#utils/log'
import { media } from '@prisma/client'
import log from '#services/log_service'

export default class CreateMediaPosterJob {
  private mediaId: number
  private mediaInfo: media | null = null
  private mangaCovers: string[] = []
  private targetWidth = 60
  private targetHeight = 90
  private gap = 2
  private outputPath: string = ''

  constructor({ mediaId }: { mediaId: number }) {
    this.mediaId = mediaId
  }

  async run() {
    await log.info({
      type: 'media',
      module: 'poster',
      action: 'media.poster.started',
      message: `media poster started: mediaId=${this.mediaId}`,
      context: {
        mediaId: this.mediaId,
      },
    })

    try {
      this.mediaInfo = await prisma.media.findUnique({ where: { mediaId: this.mediaId } })

      const mangas = await prisma.manga.findMany({
        where: {
          mediaId: this.mediaId,
          mangaCover: { not: '' },
        },
        take: 10,
        select: { mangaId: true, mangaName: true, mangaCover: true },
        orderBy: { updateTime: 'desc' },
      })

      if (!mangas.length) {
        await log.info({
          type: 'media',
          module: 'poster',
          action: 'media.poster.skipped',
          message: `media poster skipped: no manga cover found`,
          context: {
            mediaId: this.mediaId,
          },
        })
        return
      }

      this.mangaCovers = mangas
        .filter((manga) => fs.existsSync(manga.mangaCover || ''))
        .map((manga) => manga.mangaCover) as string[]

      this.outputPath = path.join(path_poster(), `smanga_media_${this.mediaId}.jpg`)
      const images: Buffer[] = []

      for (let i = 0; i < this.mangaCovers.length; i++) {
        const imagePath = this.mangaCovers[i]
        await sharp(imagePath)
          .resize(this.targetWidth, this.targetHeight)
          .toBuffer()
          .then((buffer) => images.push(buffer))
          .catch(async (err) => {
            await error_log('[media poster]', `process image failed ${imagePath}: ${err}`)
            await log.warn({
              type: 'media',
              module: 'poster',
              action: 'media.poster.image_failed',
              message: `media poster image failed: ${imagePath}`,
              error: err,
              context: {
                mediaId: this.mediaId,
                imagePath,
              },
            })
          })

        if (images.length >= 4) break
      }

      if (images.length === 0) {
        await log.warn({
          type: 'media',
          module: 'poster',
          action: 'media.poster.failed',
          message: 'media poster failed: no valid images',
          context: {
            mediaId: this.mediaId,
          },
        })
        return
      }

      if (images.length < 4) {
        const lastImage = images[images.length - 1]
        while (images.length < 4) {
          images.push(lastImage)
        }
      }

      await sharp({
        create: {
          width: (this.targetWidth + this.gap) * images.length - this.gap,
          height: this.targetHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        },
      })
        .composite(
          images.map((buffer, index) => ({
            input: buffer,
            top: 0,
            left: index * (this.targetWidth + this.gap),
          }))
        )
        .toFile(this.outputPath)

      await media_cover_log({
        mediaId: this.mediaId,
        mediaName: this.mediaInfo?.mediaName,
        mediaCover: this.outputPath,
      })

      await prisma.media.update({
        where: { mediaId: this.mediaId },
        data: { mediaCover: this.outputPath },
      })

      await log.info({
        type: 'media',
        module: 'poster',
        action: 'media.poster.completed',
        message: `media poster completed: mediaId=${this.mediaId}`,
        context: {
          mediaId: this.mediaId,
          mediaName: this.mediaInfo?.mediaName,
          outputPath: this.outputPath,
          sourceCoverCount: this.mangaCovers.length,
        },
      })

      return this.outputPath
    } catch (error: any) {
      await log.error({
        type: 'media',
        module: 'poster',
        action: 'media.poster.failed',
        message: `media poster failed: mediaId=${this.mediaId}`,
        error,
        context: {
          mediaId: this.mediaId,
          outputPath: this.outputPath,
        },
      })
      return false
    }
  }
}