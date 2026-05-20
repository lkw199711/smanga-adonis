import { TaskPriority } from '../type/index.js'
import * as fs from 'fs'
import * as path from 'path'
import { addTask } from './queue_service.js'
import { download_file, syncApi } from '#utils/api'
import { manga as mangaPrismaType } from '@prisma/client'
import log from '#services/log_service'

type mangaType = mangaPrismaType & {
  outCovers: string[]
  metaFiles: string[]
  media: { mediaId: number; mediaName: string; mediaType: number }
}

export default class SyncMangaJob {
  private receivedPath: string
  private localMangaPath: string = ''
  private link: string = ''
  private origin: string = ''
  private targetMangaRecord: mangaType | null = null

  constructor({
    link,
    origin,
    targetMangaRecord,
    receivedPath,
  }: {
    link: string
    origin: string
    targetMangaRecord: mangaType
    receivedPath: string
  }) {
    this.receivedPath = receivedPath
    this.link = link
    this.origin = origin
    this.targetMangaRecord = targetMangaRecord
  }

  async run() {
    await log.info({
      type: 'sync',
      module: 'sync',
      action: 'sync.manga.started',
      message: 'sync manga started',
      context: {
        receivedPath: this.receivedPath,
        link: this.link,
        origin: this.origin,
        mangaId: this.targetMangaRecord?.mangaId,
        mangaName: this.targetMangaRecord?.mangaName,
      },
    })

    try {
      if (!this.targetMangaRecord && this.link) {
        const analysisResponse = await syncApi.analysis(this.link)
        if (analysisResponse.code !== 0) {
          await log.warn({
            type: 'sync',
            module: 'sync',
            action: 'sync.manga.analysis.failed',
            message: 'sync manga failed: share link invalid',
            context: {
              link: this.link,
              origin: this.origin,
              code: analysisResponse.code,
              responseMessage: analysisResponse.message,
            },
          })
          return
        }

        this.targetMangaRecord = analysisResponse.data.manga
      }

      if (!this.targetMangaRecord) {
        await log.warn({
          type: 'sync',
          module: 'sync',
          action: 'sync.manga.target.missing',
          message: 'sync manga failed: target manga missing',
          context: {
            link: this.link,
            origin: this.origin,
          },
        })
        return
      }

      if (this.targetMangaRecord.media.mediaType == 0) {
        this.localMangaPath = path.join(this.receivedPath, this.targetMangaRecord.mangaName)
        if (!fs.existsSync(this.localMangaPath)) {
          fs.mkdirSync(this.localMangaPath)
        }
      } else {
        this.localMangaPath = this.receivedPath
      }

      if (this.targetMangaRecord.outCovers) {
        for (const cover of this.targetMangaRecord.outCovers) {
          const basename = path.basename(cover)
          const localPath = path.join(this.localMangaPath, basename)
          if (!fs.existsSync(localPath)) {
            await download_file(this.origin, cover, localPath)
          }
        }
      }

      if (this.targetMangaRecord.metaFiles) {
        const metaDir = this.localMangaPath + '/.smanga'
        if (!fs.existsSync(metaDir)) {
          fs.mkdirSync(metaDir)
        }

        for (const metaFile of this.targetMangaRecord.metaFiles) {
          const basename = path.basename(metaFile)
          const localPath = path.join(metaDir, basename)
          if (!fs.existsSync(localPath)) {
            await download_file(this.origin, metaFile, localPath)
          }
        }
      }

      const targetChaptersResponse = await syncApi.chapters(this.origin, this.targetMangaRecord.mangaId)
      const targetChapters = targetChaptersResponse.list
      if (!targetChapters || targetChapters.length === 0) {
        await log.warn({
          type: 'sync',
          module: 'sync',
          action: 'sync.manga.chapter.empty',
          message: 'sync manga chapter list is empty',
          context: {
            mangaId: this.targetMangaRecord.mangaId,
            mangaName: this.targetMangaRecord.mangaName,
            origin: this.origin,
          },
        })
        return
      }

      for (const chapter of targetChapters) {
        await addTask({
          taskName: 'sync_chapter_' + chapter.chapterName,
          command: 'taskSyncChapter',
          args: {
            localMangaPath: this.localMangaPath,
            targetChapterRecord: chapter,
            origin: this.origin,
          },
          priority: TaskPriority.syncChapter,
        })
      }

      await log.info({
        type: 'sync',
        module: 'sync',
        action: 'sync.manga.completed',
        message: `sync manga enqueued ${targetChapters.length} chapter jobs`,
        context: {
          mangaId: this.targetMangaRecord.mangaId,
          mangaName: this.targetMangaRecord.mangaName,
          localMangaPath: this.localMangaPath,
          chapterCount: targetChapters.length,
        },
      })
    } catch (error: any) {
      await log.error({
        type: 'sync',
        module: 'sync',
        action: 'sync.manga.failed',
        message: 'sync manga failed',
        error,
        context: {
          receivedPath: this.receivedPath,
          localMangaPath: this.localMangaPath,
          link: this.link,
          origin: this.origin,
          mangaId: this.targetMangaRecord?.mangaId,
          mangaName: this.targetMangaRecord?.mangaName,
          remoteStatus: error?.response?.status,
          remoteMessage: error?.response?.data?.message,
          remoteData: error?.response?.data,
        },
      })
      throw error
    }
  }
}