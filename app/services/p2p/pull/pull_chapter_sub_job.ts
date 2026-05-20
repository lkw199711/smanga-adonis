/**
 * 鎷夊彇鍗曠珷鑺?Bull Job(C 鏂规:鐙珛 Bull 浠诲姟)
 *
 * command: 'taskP2PPullChapter'
 *
 * args:
 *  - transferId:       鐖?p2p_transfer 涓婚敭(杩涘害/鍙栨秷渚濊禆)
 *  - groupNo:          缇ゅ彿
 *  - chapterId:        瀵圭绔犺妭 id
 *  - baseDir:          鏈湴淇濆瓨鐩綍
 *  - mangaId?:         璇ョ珷鑺傛墍灞炴极鐢?id(鐢ㄤ簬鍚?tracker 鍙戠幇 seeds,缂虹渷鏃朵互 chapter 鏌?
 *  - isSubTask?:       true=浣滀负鐖朵换鍔＄殑瀛愪换鍔?瀹屾垚鍚庨€氱煡 tracker);false/undefined=鐙珛浠诲姟
 *  - remoteMangaId?:   鍐椾綑瀛楁(涓?mangaId 绛変环)
 *
 * 琛屼负:
 *  1. 鑻?transfer 宸插彇娑?鐩存帴閫氱煡 tracker(濡傛湁)骞堕€€鍑?
 *  2. fetch /p2p/serve/chapter/:id/tree 鎷挎枃浠舵竻鍗?
 *  3. 璧峰皬涓嬭浇姹犺窇瀹?
 *  4. isSubTask 鍒?notifyDone 缁欑埗浠诲姟;鍚﹀垯鑷繁鏇存柊 transfer 鐘舵€?
 */

import prisma from '#start/prisma'
import { fetchChapterTree } from './pull_tree_fetcher.js'
import { treeFilesToTasks, type TreeResponseData, type Seed } from './pull_context.js'
import {
  ensureDir,
  isTransferCanceled,
  createThrottledProgressReporter,
  runChildDownload,
  buildHeaders,
  resolveSeeds,
} from './pull_shared.js'
import { notifyDone } from './pull_child_tracker.js'
import { log_p2p_error, log_p2p_info } from '#utils/p2p_log'

export type PullChapterJobArgs = {
  transferId: number
  groupNo: string
  chapterId: number
  baseDir: string
  mangaId: number
  isSubTask?: boolean
  /** 涓婃父宸插彂鐜扮殑 seeds(浼樺厛澶嶇敤,閬垮厤閲嶅鏌?tracker) */
  inheritedSeeds?: Seed[]
}

export default class PullChapterJob {
  private args: PullChapterJobArgs

  constructor(args: PullChapterJobArgs) {
    this.args = args
  }

  async run(): Promise<void> {
    const { transferId, chapterId, baseDir, groupNo, mangaId, isSubTask, inheritedSeeds } = this.args
    const logTag = `p2p-pull-chapter#${transferId}-c${chapterId}`

    if (await isTransferCanceled(transferId)) {
      log_p2p_info('pull.chapter.skipped_canceled', { transferId, chapterId, groupNo })
      if (isSubTask) {
        await notifyDone(transferId, { ok: false, downloadedBytes: 0, canceled: true })
      }
      return
    }

    log_p2p_info('pull.chapter.started', { transferId, chapterId, mangaId, groupNo, baseDir })
    ensureDir(baseDir)

    const reporter = createThrottledProgressReporter(transferId)
    let downloadedBytes = 0
    let ok = true
    let errorMsg: string | undefined

    try {
      // 1. 鑾峰彇 tree(閫氳繃鍐呴儴 seeds failover)
      const tree = await this.fetchTree(chapterId, groupNo, mangaId, logTag, inheritedSeeds)
      if (!tree || !tree.files?.length) {
        log_p2p_info('pull.chapter.empty_tree', { transferId, chapterId, mangaId, groupNo })
      } else {
        const mainTasks = treeFilesToTasks(tree.files, baseDir)
        // sideFiles(绔犺妭鍚岀骇澶栫疆灏侀潰):
        //  - 鐙珛鎷夌珷鑺傚満鏅?isSubTask=false):鐢辨湰浠诲姟璐熻矗,钀藉埌 tree.parentDir(绔犺妭鐖剁洰褰?
        //  - 浣滀负 MangaJob 瀛愪换鍔?isSubTask=true):MangaJob 宸查€氳繃 MetaJob 缁熶竴鎷夊彇 sideFiles,
        //    鏈换鍔″拷鐣ラ伩鍏嶉噸澶嶄笅杞?
        const sideTasks =
          !isSubTask && tree.sideFiles && tree.sideFiles.length && tree.parentDir
            ? treeFilesToTasks(tree.sideFiles, tree.parentDir)
            : []
        const tasks = [...mainTasks, ...sideTasks]
        downloadedBytes = await runChildDownload({
          transferId,
          groupNo,
          discoverArgs: {
            groupNo,
            shareType: 'chapter',
            remoteMangaId: mangaId,
          },
          inheritedSeeds,
          tasks,
          logTag,
          reporter,
        })
      }
      log_p2p_info('pull.chapter.completed', {
        transferId,
        chapterId,
        mangaId,
        groupNo,
        downloadedBytes,
        fileCount: tree?.files?.length || 0,
      })
    } catch (e: any) {
      ok = false
      errorMsg = e?.message || String(e)
      log_p2p_error('pull.chapter.run', e)
      await reporter.flush().catch(() => {})
    }

    // 瀛愪换鍔?閫氱煡鐖惰窡韪櫒;鐙珛浠诲姟:鑷繁钀芥渶缁堢姸鎬?
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

  /** 绔犺妭 tree 鐨?seeds 鍙戠幇闇€瑕?remoteMangaId(tracker 鎸?manga 缁村害绱㈠紩) */
  private async fetchTree(
    chapterId: number,
    groupNo: string,
    mangaId: number,
    logTag: string,
    inheritedSeeds?: Seed[]
  ): Promise<TreeResponseData> {
    const headers = buildHeaders(groupNo)
    const seeds = await resolveSeeds(
      inheritedSeeds,
      {
        groupNo,
        shareType: 'chapter',
        remoteMangaId: mangaId,
      },
      logTag
    )
    if (!seeds.length) {
      throw new Error('缇ょ粍鍐呮湭鍙戠幇璇ヨ祫婧愮殑鍙敤鑺傜偣 (seeds 鍒楄〃涓虹┖)')
    }
    return fetchChapterTree(seeds, headers, logTag, chapterId)
  }

  private async finalizeStandalone(
    transferId: number,
    ok: boolean,
    _downloadedBytes: number,
    errorMsg?: string
  ) {
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
    } catch (e: any) {
    }
  }
}
