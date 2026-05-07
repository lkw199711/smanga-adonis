/**
 * 拉取单章节 Bull Job(C 方案:独立 Bull 任务)
 *
 * command: 'taskP2PPullChapter'
 *
 * args:
 *  - transferId:       父 p2p_transfer 主键(进度/取消依赖)
 *  - groupNo:          群号
 *  - chapterId:        对端章节 id
 *  - baseDir:          本地保存目录
 *  - mangaId?:         该章节所属漫画 id(用于向 tracker 发现 seeds,缺省时以 chapter 查)
 *  - isSubTask?:       true=作为父任务的子任务(完成后通知 tracker);false/undefined=独立任务
 *  - remoteMangaId?:   冗余字段(与 mangaId 等价)
 *
 * 行为:
 *  1. 若 transfer 已取消,直接通知 tracker(如有)并退出
 *  2. fetch /p2p/serve/chapter/:id/tree 拿文件清单
 *  3. 起小下载池跑完
 *  4. isSubTask 则 notifyDone 给父任务;否则自己更新 transfer 状态
 */

import prisma from '#start/prisma'
import { fetchChapterTree } from './pull_tree_fetcher.js'
import { treeFilesToTasks, type TreeResponseData } from './pull_context.js'
import {
  ensureDir,
  isTransferCanceled,
  createThrottledProgressReporter,
  runChildDownload,
  buildHeaders,
  discoverSeeds,
} from './pull_shared.js'
import { notifyDone } from './pull_child_tracker.js'

export type PullChapterJobArgs = {
  transferId: number
  groupNo: string
  chapterId: number
  baseDir: string
  mangaId: number
  isSubTask?: boolean
}

export default class PullChapterJob {
  private args: PullChapterJobArgs

  constructor(args: PullChapterJobArgs) {
    this.args = args
  }

  async run(): Promise<void> {
    const { transferId, chapterId, baseDir, groupNo, mangaId, isSubTask } = this.args
    const logTag = `p2p-pull-chapter#${transferId}-c${chapterId}`

    if (await isTransferCanceled(transferId)) {
      console.log(`[${logTag}] 已取消,跳过`)
      if (isSubTask) {
        await notifyDone(transferId, { ok: false, downloadedBytes: 0, canceled: true })
      }
      return
    }

    console.log(`[${logTag}] 开始 chapterId=${chapterId} baseDir=${baseDir}`)
    ensureDir(baseDir)

    const reporter = createThrottledProgressReporter(transferId)
    let downloadedBytes = 0
    let ok = true
    let errorMsg: string | undefined

    try {
      // 1. 获取 tree(通过内部 seeds failover)
      const tree = await this.fetchTree(chapterId, groupNo, mangaId, logTag)
      if (!tree || !tree.files?.length) {
        console.warn(`[${logTag}] tree 为空,视为成功但无文件`)
      } else {
        const tasks = treeFilesToTasks(tree.files, baseDir)
        downloadedBytes = await runChildDownload({
          transferId,
          groupNo,
          discoverArgs: {
            groupNo,
            shareType: 'chapter',
            remoteMangaId: mangaId,
          },
          tasks,
          logTag,
          reporter,
        })
      }
      console.log(`[${logTag}] 完成 files=${tree?.files?.length || 0} bytes=${downloadedBytes}`)
    } catch (e: any) {
      ok = false
      errorMsg = e?.message || String(e)
      console.error(`[${logTag}] 失败: ${errorMsg}`)
      await reporter.flush().catch(() => {})
    }

    // 子任务:通知父跟踪器;独立任务:自己落最终状态
    if (isSubTask) {
      await notifyDone(transferId, {
        ok,
        downloadedBytes,
        error: errorMsg,
      })
    } else {
      await this.finalizeStandalone(transferId, ok, downloadedBytes, errorMsg)
    }
  }

  /** 章节 tree 的 seeds 发现需要 remoteMangaId(tracker 按 manga 维度索引) */
  private async fetchTree(
    chapterId: number,
    groupNo: string,
    mangaId: number,
    logTag: string
  ): Promise<TreeResponseData> {
    const headers = buildHeaders(groupNo)
    const seeds = await discoverSeeds({
      groupNo,
      shareType: 'chapter',
      remoteMangaId: mangaId,
    })
    if (!seeds.length) {
      throw new Error('群组内未发现该资源的可用节点 (seeds 列表为空)')
    }
    return fetchChapterTree(seeds, headers, logTag, chapterId)
  }

  private async finalizeStandalone(
    transferId: number,
    ok: boolean,
    downloadedBytes: number,
    errorMsg?: string
  ) {
    const tag = `p2p-pull-chapter#${transferId}`
    try {
      const cur = await prisma.p2p_transfer.findUnique({
        where: { p2pTransferId: transferId },
        select: { status: true, downloadedBytes: true },
      })
      const isCanceled = cur?.status === 'canceled'

      await prisma.p2p_transfer.update({
        where: { p2pTransferId: transferId },
        data: {
          status: isCanceled ? 'canceled' : ok ? 'success' : 'failed',
          progress: ok && !isCanceled ? 100 : undefined,
          error: ok ? null : errorMsg || 'unknown error',
          endTime: new Date(),
          speedBps: 0,
        },
      })
      console.log(
        `[${tag}] finalize → ${isCanceled ? 'canceled' : ok ? 'success' : 'failed'} bytes=${downloadedBytes}`
      )
    } catch (e: any) {
      console.warn(`[${tag}] finalize 失败: ${e?.message || e}`)
    }
  }
}