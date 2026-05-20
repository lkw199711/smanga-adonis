/**
 * 鎷夊彇鍏冩暟鎹?Bull Job(C 鏂规:鐙珛 Bull 浠诲姟)
 *
 * command: 'taskP2PPullMeta'
 *
 * args:
 *  - transferId:   鐖?p2p_transfer 涓婚敭
 *  - groupNo:      缇ゅ彿
 *  - mangaId:      鎵€灞炴极鐢?id(鐢ㄤ簬 seeds 鍙戠幇)
 *  - files:        鐢辩埗 MangaJob 宸茬瓫濂界殑鍏冩暟鎹枃浠舵竻鍗?TreeFileEntry[])
 *  - baseDir:      鏈湴淇濆瓨鐩綍(涓庢极鐢讳富浣撲竴鑷?涓嶅灞?
 *  - isSubTask:    true=鐖朵换鍔＄殑瀛愪换鍔?瀹屾垚鍚?notifyDone);false=鐙珛浠诲姟(缃曡)
 *
 * 璁捐瑕佺偣:
 *  - 鏈?Job 涓嶈嚜宸?fetch tree(鐢辩埗 MangaJob 宸叉媺杩囧苟鎸夊厓鏁版嵁瑙勫垯绛涘ソ浼犲叆),閬垮厤閲嶅璇锋眰
 *  - 浣嗕粛鐙珛鍙戠幇 seeds 骞惰捣灏忎笅杞芥睜,淇濈暀澶?seed 骞惰鑳藉姏
 */

import prisma from '#start/prisma'
import { treeFilesToTasks, type TreeFileEntry, type Seed } from './pull_context.js'
import {
  ensureDir,
  isTransferCanceled,
  createThrottledProgressReporter,
  runChildDownload,
} from './pull_shared.js'
import { notifyDone } from './pull_child_tracker.js'
import { log_p2p_error, log_p2p_info } from '#utils/p2p_log'

/** 鍒ゆ柇 relPath 鏄惁涓哄厓鏁版嵁鏂囦欢 */
export function isMetaFile(relPath: string): boolean {
  if (!relPath) return false
  const rel = relPath.replace(/\\/g, '/').toLowerCase()

  // .smanga/ 鐩綍涓嬪叏閮ㄨ涓哄厓鏁版嵁
  if (rel.startsWith('.smanga/') || rel === '.smanga') return true

  const base = rel.split('/').pop() || ''

  // 鏍圭洰褰曢€氱敤鍏冩暟鎹?
  if (base === 'series.json') return true
  if (base === 'comicinfo.xml') return true

  // 浠呭鐞嗘牴鐩綍鐩存帴鎸傝浇鐨勫皝闈?涓嶅惈瀛愮洰褰?,鏀寔鍚屽悕閫掑:
  //   cover.jpg / cover-1.jpg / cover1.jpg / banner.jpg / banner-1.jpg / fanart.jpg ...
  // 瀛愮洰褰曚腑鐨勫浘鐗?閫氬父鏄珷鑺傚唴瀹瑰浘)涓嶇畻鍏冩暟鎹?
  if (!rel.includes('/')) {
    if (/^(cover|banner|fanart|thumbnail|poster)([-_ ]?\d+)?\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(base)) {
      return true
    }
  }

  return false
}

export type PullMetaJobArgs = {
  transferId: number
  groupNo: string
  mangaId: number
  /** 鍏冩暟鎹枃浠舵竻鍗?浠?baseDir 涓烘牴) */
  files: TreeFileEntry[]
  /** 鍏冩暟鎹惤鐩樻牴鐩綍(閫氬父 = 婕敾鐩綍) */
  baseDir: string
  /**
   * 鍚岀骇澶栫疆鏂囦欢娓呭崟(浠?sideBaseDir 涓烘牴),鍏稿瀷鍦烘櫙:
   *  - 婕敾鍚岀骇澶栫疆灏侀潰 / smanga-info 鐩綍(baseDir = 婕敾鐖剁洰褰?
   *  - 绔犺妭鍚岀骇澶栫疆灏侀潰(baseDir = 婕敾鐩綍,relPath 鍚珷鑺傜浉瀵硅矾寰?
   * 涓?files 涓€骞朵笅杞?鍏变韩鍚屼竴涓繘搴︿笂鎶ュ櫒銆?
   */
  sideFiles?: TreeFileEntry[]
  /** sideFiles 鐨勬牴鐩綍(婕敾鐖剁洰褰? */
  sideBaseDir?: string
  isSubTask?: boolean
  /** 涓婃父宸插彂鐜扮殑 seeds(浼樺厛澶嶇敤,閬垮厤閲嶅鏌?tracker) */
  inheritedSeeds?: Seed[]
}

export default class PullMetaJob {
  private args: PullMetaJobArgs

  constructor(args: PullMetaJobArgs) {
    this.args = args
  }

  async run(): Promise<void> {
    const { transferId, mangaId, groupNo, files, baseDir, sideFiles, sideBaseDir, isSubTask, inheritedSeeds } = this.args
    const logTag = `p2p-pull-meta#${transferId}-m${mangaId}`

    if (await isTransferCanceled(transferId)) {
      log_p2p_info('pull.meta.skipped_canceled', { transferId, mangaId, groupNo })
      if (isSubTask) {
        await notifyDone(transferId, { ok: false, downloadedBytes: 0, canceled: true })
      }
      return
    }

    const totalFiles = (files?.length || 0) + (sideFiles?.length || 0)
    // 绌烘竻鍗曠洿鎺ヨ涓烘垚鍔?甯歌浜庡崟鏂囦欢婕敾鎴栨棤鍏冩暟鎹殑婕敾)
    if (!totalFiles) {
      log_p2p_info('pull.meta.empty', { transferId, mangaId, groupNo })
      if (isSubTask) {
        await notifyDone(transferId, { ok: true, downloadedBytes: 0 })
      } else {
        await this.finalizeStandalone(transferId, true, 0)
      }
      return
    }

    log_p2p_info('pull.meta.started', {
      transferId,
      mangaId,
      groupNo,
      metaCount: files?.length || 0,
      sideCount: sideFiles?.length || 0,
      baseDir,
    })
    ensureDir(baseDir)
    if (sideBaseDir) ensureDir(sideBaseDir)

    const reporter = createThrottledProgressReporter(transferId)
    let downloadedBytes = 0
    let ok = true
    let errorMsg: string | undefined

    try {
      const metaTasks = files && files.length ? treeFilesToTasks(files, baseDir) : []
      const sideTasks =
        sideFiles && sideFiles.length && sideBaseDir
          ? treeFilesToTasks(sideFiles, sideBaseDir)
          : []
      const tasks = [...metaTasks, ...sideTasks]
      downloadedBytes = await runChildDownload({
        transferId,
        groupNo,
        discoverArgs: {
          groupNo,
          shareType: 'manga',
          remoteMangaId: mangaId,
        },
        inheritedSeeds,
        tasks,
        logTag,
        reporter,
      })
      log_p2p_info('pull.meta.completed', { transferId, mangaId, groupNo, downloadedBytes })
    } catch (e: any) {
      ok = false
      errorMsg = e?.message || String(e)
      log_p2p_error('pull.meta.run', e)
      await reporter.flush().catch(() => {})
    }

    if (isSubTask) {
      await notifyDone(transferId, { ok, downloadedBytes, error: errorMsg })
    } else {
      await this.finalizeStandalone(transferId, ok, downloadedBytes, errorMsg)
    }
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
        select: { status: true },
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
