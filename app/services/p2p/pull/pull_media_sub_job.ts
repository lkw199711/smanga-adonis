/**
 * 拉取媒体库 Bull Job(C 方案:独立 Bull 任务 + 派生 MangaJob)
 *
 * command: 'taskP2PPullMedia'
 *
 * args:
 *  - transferId:  父 p2p_transfer 主键(就是 media transfer 本身)
 *  - groupNo:     群号
 *  - mediaId:     对端 media 库 id
 *  - parentDir:   本地保存根目录(通常是 transfer.receivedPath)
 *
 * 行为:
 *  1. 发现 seeds(media 维度)
 *  2. 调 /media/:id/mangas 拿漫画列表
 *  3. initTracker(transferId, expected=N_mangas) —— 初始以\"漫画本数\"作为预期
 *     (后续每本目录漫画的 MangaJob 会调 transferSelfToChildren 动态扩展)
 *  4. 为每本漫画 addTask('taskP2PPullManga', {isSubTask: true})
 *  5. MediaJob 返回,真正完成由底层 Meta/Chapter/单文件 Manga 的 notifyDone 聚合
 *
 * 无子任务的情形:
 *  - 媒体库下 0 本漫画 → 不 initTracker,直接 finalize success
 */

import prisma from '#start/prisma'
import { addTask } from '#services/queue_service'
import { TaskPriority } from '../../../type/index.js'
import { fetchMediaMangas } from './pull_tree_fetcher.js'
import {
  ensureDir,
  isTransferCanceled,
  buildHeaders,
  discoverSeeds,
} from './pull_shared.js'
import { initTracker } from './pull_child_tracker.js'
import type { Seed } from './pull_context.js'

export type PullMediaJobArgs = {
  transferId: number
  groupNo: string
  mediaId: number
  parentDir: string
}

export default class PullMediaJob {
  private args: PullMediaJobArgs

  constructor(args: PullMediaJobArgs) {
    this.args = args
  }

  async run(): Promise<void> {
    const { transferId, mediaId, groupNo, parentDir } = this.args
    const logTag = `p2p-pull-media#${transferId}-M${mediaId}`

    if (await isTransferCanceled(transferId)) {
      console.log(`[${logTag}] 已取消,跳过`)
      return
    }

    console.log(`[${logTag}] 开始 mediaId=${mediaId} parentDir=${parentDir}`)

    // 把 transfer 状态切换为 running(独立入口调用本 Job 时)
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
    // 发现到的 seeds 保存下来,派发 MangaJob 时透传,避免每本 manga 都去查一次 tracker
    let discoveredSeeds: Seed[] = []
    try {
      const headers = buildHeaders(groupNo)
      discoveredSeeds = await discoverSeeds({
        groupNo,
        shareType: 'media',
        remoteMediaId: mediaId,
      })
      if (!discoveredSeeds.length) throw new Error('群组内未发现该资源的可用节点 (seeds 列表为空)')
      const raw = await fetchMediaMangas(discoveredSeeds, headers, logTag, mediaId)
      mangas = raw
        .filter((m: any) => m && m.mangaId)
        .map((m: any) => ({
          mangaId: Number(m.mangaId),
          mangaName: String(m.mangaName || ''),
        }))
    } catch (e: any) {
      const msg = e?.message || String(e)
      console.error(`[${logTag}] 获取漫画列表失败: ${msg}`)
      await this.fail(transferId, msg)
      return
    }

    if (!mangas.length) {
      console.warn(`[${logTag}] 漫画列表为空,直接完成`)
      await this.finalize(transferId, true, 0, '媒体库下无漫画')
      return
    }

    // 以漫画本数作为初始 expected;MangaJob 处理目录漫画时会 transferSelfToChildren 动态扩展
    initTracker(transferId, mangas.length, 0)

    console.log(`[${logTag}] 共 ${mangas.length} 本漫画,派发 MangaJob 子任务`)

    for (const m of mangas) {
      if (await isTransferCanceled(transferId)) {
        console.log(`[${logTag}] 派发过程中检测到取消,中止`)
        break
      }
      await addTask({
        taskName: `p2p-pull-manga-${m.mangaId}`,
        command: 'taskP2PPullManga',
        args: {
          transferId,
          groupNo,
          mangaId: m.mangaId,
          parentDir,
          fallbackName: m.mangaName,
          isSubTask: true,
          inheritedSeeds: discoveredSeeds,
        },
        priority: TaskPriority.p2pPullManga,
      })
    }

    console.log(`[${logTag}] 派发完成,等待子任务结算`)
  }

  private async fail(transferId: number, msg: string) {
    await prisma.p2p_transfer
      .update({
        where: { p2pTransferId: transferId },
        data: { status: 'failed', error: msg, endTime: new Date(), speedBps: 0 },
      })
      .catch(() => {})
  }

  private async finalize(
    transferId: number,
    ok: boolean,
    _downloadedBytes: number,
    note?: string
  ) {
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