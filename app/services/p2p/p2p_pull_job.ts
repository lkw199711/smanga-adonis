/**
 * P2P 拉取任务入口分发器(C 方案)
 *
 * 原来的 P2PPullJob 是一个"单体父 Job",包含 seeds 发现 + tree 拉取 + 下载池调度 +
 * 落库的完整流程。C 方案把它拆成 4 个独立的 Bull Job(media/manga/chapter/meta),
 * 它们各自通过 queueService.addTask 入队执行。
 *
 * 本文件现在只做一件事:根据 transfer.transferType 把入口任务转发到对应的新 Job。
 * 保留本文件的目的:controller 里的 addTask('taskP2PPull', {transferId}) 不变,
 * 队列层仍然能识别并分发,避免一次性改动 controller + queue_service + 所有调用点。
 *
 * 注意:本 Job 自身在分发完成后立即返回(不等子 Job 完成)。真正的完成结算由底层
 * 子 Job + pull_child_tracker 聚合负责。
 */

import prisma from '#start/prisma'
import { addTask } from '#services/queue_service'
import { TaskPriority } from '../../type/index.js'

type P2PPullArgs = {
  transferId: number
}

export default class P2PPullJob {
  private transferId: number

  constructor(args: P2PPullArgs) {
    this.transferId = args.transferId
  }

  async run() {
    const logTag = `p2p-pull-entry#${this.transferId}`
    console.log(`[${logTag}] 入口分发器启动`)

    const transfer = await prisma.p2p_transfer.findUnique({
      where: { p2pTransferId: this.transferId },
    })
    if (!transfer) {
      console.warn(`[${logTag}] transfer not found`)
      return
    }
    if (transfer.status === 'canceled') {
      console.log(`[${logTag}] transfer canceled`)
      return
    }
    if (!transfer.groupNo) {
      await this.fail('transfer.groupNo 缺失')
      return
    }

    try {
      if (transfer.transferType === 'chapter') {
        if (!transfer.remoteChapterId) throw new Error('remoteChapterId 缺失')
        if (!transfer.remoteMangaId) throw new Error('remoteMangaId 缺失(章节需要按 manga 发现 seeds)')
        // 章节独立入口:让 ChapterJob 自己完成 transfer 落状态(非子任务模式)
        await this.markRunning(transfer.p2pTransferId)
        await addTask({
          taskName: `p2p-pull-chapter-${transfer.remoteChapterId}`,
          command: 'taskP2PPullChapter',
          args: {
            transferId: transfer.p2pTransferId,
            groupNo: transfer.groupNo,
            chapterId: transfer.remoteChapterId,
            mangaId: transfer.remoteMangaId,
            baseDir: transfer.receivedPath,
            isSubTask: false,
          },
          priority: TaskPriority.p2pPullChapter,
        })
      } else if (transfer.transferType === 'manga') {
        if (!transfer.remoteMangaId) throw new Error('remoteMangaId 缺失')
        await this.markRunning(transfer.p2pTransferId)
        await addTask({
          taskName: `p2p-pull-manga-${transfer.remoteMangaId}`,
          command: 'taskP2PPullManga',
          args: {
            transferId: transfer.p2pTransferId,
            groupNo: transfer.groupNo,
            mangaId: transfer.remoteMangaId,
            parentDir: transfer.receivedPath,
            fallbackName: transfer.remoteName,
            isSubTask: false,
          },
          priority: TaskPriority.p2pPullManga,
        })
      } else if (transfer.transferType === 'media') {
        if (!transfer.remoteMediaId) throw new Error('remoteMediaId 缺失')
        // MediaJob 内部会自行把 transfer 切换到 running
        await addTask({
          taskName: `p2p-pull-media-${transfer.remoteMediaId}`,
          command: 'taskP2PPullMedia',
          args: {
            transferId: transfer.p2pTransferId,
            groupNo: transfer.groupNo,
            mediaId: transfer.remoteMediaId,
            parentDir: transfer.receivedPath,
          },
          priority: TaskPriority.p2pPullMedia,
        })
      } else {
        throw new Error(`暂不支持的 transferType: ${transfer.transferType}`)
      }

      console.log(`[${logTag}] 分发完成 type=${transfer.transferType}`)
    } catch (e: any) {
      const msg = e?.message || String(e)
      console.error(`[${logTag}] 分发失败: ${msg}`)
      await this.fail(msg)
    }
  }

  private async markRunning(transferId: number) {
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
  }

  private async fail(msg: string) {
    await prisma.p2p_transfer
      .update({
        where: { p2pTransferId: this.transferId },
        data: { status: 'failed', error: msg, endTime: new Date(), speedBps: 0 },
      })
      .catch(() => {})
  }
}