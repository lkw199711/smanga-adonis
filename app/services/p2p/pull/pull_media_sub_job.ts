import prisma from '#start/prisma'
import { addTask } from '#services/queue_service'
import { TaskPriority } from '../../../type/index.js'
import { fetchMediaMangas } from './pull_tree_fetcher.js'
import { ensureDir, isTransferCanceled, buildHeaders, discoverSeeds } from './pull_shared.js'
import {
  attachQueueJobToTask,
  initTracker,
  registerTransferTask,
} from './pull_child_tracker.js'
import { extractErrorMessage } from '#utils/p2p_log'
import type { Seed } from './pull_context.js'
import { getP2PPullTimeout } from './pull_timeout.js'

export type PullMediaJobArgs = {
  transferId: number
  groupNo: string
  mediaId: number
  parentDir: string
}

export default class PullMediaJob {
  constructor(private args: PullMediaJobArgs) {}

  async run(): Promise<void> {
    const { transferId, mediaId, groupNo, parentDir } = this.args
    const logTag = `p2p-pull-media#${transferId}-M${mediaId}`

    if (await isTransferCanceled(transferId)) return

    await prisma.p2p_transfer
      .update({
        where: { p2pTransferId: transferId },
        data: {
          status: 'running',
          startTime: new Date(),
          progress: 0,
          downloadedBytes: 0n,
          speedBps: 0,
        },
      })
      .catch(() => {})

    ensureDir(parentDir)

    let mangas: Array<{ mangaId: number; mangaName: string }> = []
    let discoveredSeeds: Seed[] = []

    try {
      const headers = buildHeaders(groupNo)
      discoveredSeeds = await discoverSeeds({
        groupNo,
        shareType: 'media',
        remoteMediaId: mediaId,
      })
      if (!discoveredSeeds.length) throw new Error('no seeds found for media')
      const raw = await fetchMediaMangas(discoveredSeeds, headers, logTag, mediaId)
      mangas = raw
        .filter((m: any) => m && m.mangaId)
        .map((m: any) => ({
          mangaId: Number(m.mangaId),
          mangaName: String(m.mangaName || ''),
        }))
    } catch (error) {
      await this.fail(transferId, extractErrorMessage(error))
      return
    }

    if (!mangas.length) {
      await this.finalize(transferId, true, 'media contains no mangas')
      return
    }

    initTracker(transferId, mangas.length, 0)

    for (const manga of mangas) {
      if (await isTransferCanceled(transferId)) break

      const taskKey = `manga:${manga.mangaId}`
      await registerTransferTask({
        transferId,
        taskKey,
        taskType: 'manga',
      })
      const job = await addTask({
        taskName: `p2p-pull-manga-${manga.mangaId}`,
        command: 'taskP2PPullManga',
        args: {
          transferId,
          groupNo,
          mangaId: manga.mangaId,
          taskKey,
          parentDir,
          fallbackName: manga.mangaName,
          isSubTask: true,
          inheritedSeeds: discoveredSeeds,
        },
        priority: TaskPriority.p2pPullManga,
        timeout: getP2PPullTimeout('manga'),
      })
      await attachQueueJobToTask(transferId, taskKey, Number((job as any)?.id || 0) || null)
    }
  }

  private async fail(transferId: number, message: string) {
    await prisma.p2p_transfer
      .update({
        where: { p2pTransferId: transferId },
        data: { status: 'failed', error: message, endTime: new Date(), speedBps: 0 },
      })
      .catch(() => {})
  }

  private async finalize(transferId: number, ok: boolean, note?: string) {
    const cur = await prisma.p2p_transfer.findUnique({
      where: { p2pTransferId: transferId },
      select: { status: true },
    })
    const isCanceled = cur?.status === 'canceled'
    await prisma.p2p_transfer
      .update({
        where: { p2pTransferId: transferId },
        data: {
          status: isCanceled ? 'canceled' : ok ? 'success' : 'failed',
          progress: ok && !isCanceled ? 100 : undefined,
          error: ok ? note || null : note || 'unknown error',
          endTime: new Date(),
          speedBps: 0,
        },
      })
      .catch(() => {})
  }
}
