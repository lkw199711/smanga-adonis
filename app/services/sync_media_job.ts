import { TaskPriority } from '../type/index.js'
import { addTask } from './queue_service.js'
import { syncApi } from '#utils/api'
import { media as mediaType } from '@prisma/client'
import log from '#services/log_service'

export default class SyncMediaJob {
  private targetMediaRecord: mediaType | null = null
  private receivedPath: string
  private link: string
  private origin: string

  constructor({ receivedPath, link, origin }: { targetMediaId: number; receivedPath: string; link: string; origin: string }) {
    this.receivedPath = receivedPath
    this.link = link
    this.origin = origin
  }

  async run() {
    await log.info({
      type: 'sync',
      module: 'sync',
      action: 'sync.media.started',
      message: 'sync media started',
      context: {
        receivedPath: this.receivedPath,
        link: this.link,
        origin: this.origin,
      },
    })

    try {
      const analysisResponse = await syncApi.analysis(this.link)
      if (analysisResponse.code !== 0) {
        await log.warn({
          type: 'sync',
          module: 'sync',
          action: 'sync.media.analysis.failed',
          message: 'sync media failed: share link invalid',
          context: {
            link: this.link,
            origin: this.origin,
            code: analysisResponse.code,
            responseMessage: analysisResponse.message,
          },
        })
        return
      }

      this.targetMediaRecord = analysisResponse.data?.media
      if (!this.targetMediaRecord) {
        await log.warn({
          type: 'sync',
          module: 'sync',
          action: 'sync.media.target.missing',
          message: 'sync media failed: target media missing',
          context: {
            link: this.link,
            origin: this.origin,
          },
        })
        return
      }

      const mangaResponse = await syncApi.mangas(this.origin, this.targetMediaRecord.mediaId)
      const mangas = mangaResponse.list || []

      for (const manga of mangas) {
        await addTask({
          taskName: `sync_media_${this.targetMediaRecord.mediaId}`,
          command: 'taskSyncManga',
          args: {
            link: this.link,
            origin: this.origin,
            receivedPath: this.receivedPath,
            targetMangaRecord: manga,
          },
          priority: TaskPriority.syncManga,
        })
      }

      await log.info({
        type: 'sync',
        module: 'sync',
        action: 'sync.media.completed',
        message: `sync media task enqueued ${mangas.length} manga jobs`,
        context: {
          mediaId: this.targetMediaRecord.mediaId,
          mediaName: this.targetMediaRecord.mediaName,
          mangaCount: mangas.length,
          link: this.link,
          origin: this.origin,
        },
      })
    } catch (error: any) {
      await log.error({
        type: 'sync',
        module: 'sync',
        action: 'sync.media.failed',
        message: 'sync media failed',
        error,
        context: {
          receivedPath: this.receivedPath,
          link: this.link,
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