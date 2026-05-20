/**
 * 鐖朵换鍔″瓙浠诲姟璺熻釜鍣?鍐呭瓨鐗?
 *
 * 鐢ㄤ簬 C 鏂规:鐖?Bull Job(PullMediaJob/PullMangaJob)閫氳繃 addTask 娲惧彂 N 涓瓙浠诲姟鍚?
 * 闇€瑕佺瓑"鏈€鍚庝竴涓瓙浠诲姟瀹屾垚"鏃舵洿鏂扮埗 p2p_transfer 鐨勬渶缁堢姸鎬併€傜敱浜?Bull Job 鎵ц瀹?
 * 灏辫繑鍥?鐖?Job 杩涚▼鍐呮棤娉?await 瀛?Job 鐨勫畬鎴?杩欓噷鐢ㄦā鍧楃骇鍐呭瓨 Map 鍋氬紩鐢ㄨ鏁般€?
 *
 * 宸ヤ綔娴佺▼(涓ゅ眰宓屽鎵佸钩鍖?:
 *   MediaJob:
 *     1. initTracker(transferId, expected=N_mangas, totalBytes?)
 *     2. 娲惧彂 N 涓?MangaJob(isSubTask=true)
 *   MangaJob(鍗曟枃浠?:
 *     3. 涓嬭浇瀹屾垚鍚?notifyDone(transferId, {ok, bytes})
 *   MangaJob(鐩綍,闇€瑕佸啀鎷?:
 *     4. 璋?transferSelfToChildren(transferId, childCount = 1+chapters.length)
 *        鈫?鎶婅嚜宸辩殑 1 涓?棰勬湡浣?鏇挎崲涓?childCount 涓?
 *     5. 娲惧彂 MetaJob + N ChapterJob(isSubTask=true)
 *   MetaJob / ChapterJob:
 *     6. 涓嬭浇瀹屾垚鍚?notifyDone(transferId, {ok, bytes})
 *   璺熻釜鍣?
 *     7. 褰?doneCount >= expectedTotal 鏃惰仛鍚堝苟 finalize 鐖?transfer
 *
 * 閲嶅惎闄愬埗:
 *   妯″潡绾?Map 涓嶆寔涔呭寲,杩涚▼閲嶅惎浼氫涪澶辫鏁?鐖?transfer 浼氭案涔呭崱鍦?running銆?
 *   TODO(future): 鑻ラ渶瑕佸鐏?鏀圭敤 Redis 鎴栬惤鍒?p2p_transfer 鏂板瓧娈点€?
 */

import prisma from '#start/prisma'
import { log_p2p_error, log_p2p_info } from '#utils/p2p_log'

type ChildOutcome = {
  ok: boolean
  /** 璇ュ瓙浠诲姟绱涓嬭浇瀛楄妭鏁?浠呮垚鍔熺殑閮ㄥ垎) */
  downloadedBytes: number
  /** 澶辫触鏃剁殑閿欒娑堟伅 */
  error?: string
  /** 琚彇娑堟椂涓?true */
  canceled?: boolean
}

type TrackerEntry = {
  expectedTotal: number
  doneCount: number
  failedCount: number
  canceledCount: number
  errors: string[]
  /** 宸茶仛鍚堢殑涓嬭浇瀛楄妭鏁?*/
  aggregatedBytes: number
  /** 璁板綍鍒涘缓鏃堕棿,渚夸簬璋冭瘯 */
  createdAt: number
  /** 鐖朵换鍔″０鏄庣殑 totalBytes(渚涙棩蹇?鍏滃簳,杩涘害瀹炴椂闈犲悇瀛?Job 鐨?onBytes) */
  totalBytes: number
}

const registry = new Map<number, TrackerEntry>()

/**
 * 鐖?Job 鍒濆鍖栬窡韪櫒
 * @param transferId     鐖?p2p_transfer 涓婚敭
 * @param expectedTotal  棰勬湡娲惧彂鐨勫瓙浠诲姟鏁伴噺
 * @param totalBytes     鐖朵换鍔℃€诲瓧鑺傛暟(鍙€?涓昏鐢ㄤ簬鏃ュ織)
 */
export function initTracker(
  transferId: number,
  expectedTotal: number,
  totalBytes: number = 0
): void {
  if (expectedTotal <= 0) {
    // 娌℃湁瀛愪换鍔″氨涓嶅垱寤鸿褰?鐖?Job 鑷澶勭悊 transfer 鐘舵€?
    return
  }
  registry.set(transferId, {
    expectedTotal,
    doneCount: 0,
    failedCount: 0,
    canceledCount: 0,
    errors: [],
    aggregatedBytes: 0,
    createdAt: Date.now(),
    totalBytes,
  })
  log_p2p_info('transfer.children.init', { transferId, expectedTotal, totalBytes })
}

/**
 * 涓棿灞?Job(濡?MangaJob)鍦ㄦ淳鍙戠湡姝ｅ瓙浠诲姟鍓嶈皟鐢?
 * 鎶婅嚜宸卞崰鐢ㄧ殑 1 涓?棰勬湡浣?鏇挎崲涓?childCount 涓€?
 *
 * 绛変环浜?expectedTotal += (childCount - 1)
 *  - childCount=0  鈫?expectedTotal -= 1(鐩稿綋浜?鑷繁鏃犲瓙浠诲姟,鐩存帴瀹屾垚")
 *                    璋冪敤鏂逛笉搴旇鍐?notifyDone 鑷繁
 *  - childCount=1  鈫?expectedTotal 涓嶅彉("鑷繁閫€浣?鐢卞敮涓€瀛愪换鍔℃帴鏇?)
 *  - childCount>1  鈫?expectedTotal 澧炲姞
 *
 * 鑻ヨ皟鏁村悗 doneCount >= expectedTotal,璇存槑宸茬粡杈惧埌瀹屾垚鏉′欢,涓诲姩瑙﹀彂 finalize銆?
 */
export async function transferSelfToChildren(
  transferId: number,
  childCount: number
): Promise<void> {
  const entry = registry.get(transferId)
  if (!entry) {
    log_p2p_info('transfer.children.expand.missing_tracker', { transferId, childCount })
    return
  }
  const delta = childCount - 1
  const before = entry.expectedTotal
  entry.expectedTotal += delta
  log_p2p_info('transfer.children.expanded', {
    transferId,
    childCount,
    expectedBefore: before,
    expectedAfter: entry.expectedTotal,
  })
  if (entry.doneCount >= entry.expectedTotal) {
    registry.delete(transferId)
    await finalizeParentTransfer(transferId, entry)
  }
}

/**
 * 瀛愪换鍔″畬鎴愭椂閫氱煡(鍚屼竴 transferId 姣忚皟鐢ㄤ竴娆¤鏁?+1)
 */
export async function notifyDone(
  transferId: number,
  outcome: ChildOutcome
): Promise<void> {
  const entry = registry.get(transferId)
  if (!entry) {
    // 涓ょ鎯呭喌:1) 鍗曞眰浠诲姟(chapter/manga 鑷媺,娌℃湁璧扮埗瀛?涓嶅簲璇ヨ繘鍏ユ鍒嗘敮
    //          2) 杩涚▼閲嶅惎鍚庝涪澶卞唴瀛樿褰?
    log_p2p_info('transfer.children.notify.missing_tracker', {
      transferId,
      ok: outcome.ok,
      canceled: !!outcome.canceled,
      downloadedBytes: outcome.downloadedBytes || 0,
    })
    return
  }

  entry.doneCount += 1
  entry.aggregatedBytes += outcome.downloadedBytes || 0
  if (outcome.canceled) entry.canceledCount += 1
  else if (!outcome.ok) {
    entry.failedCount += 1
    if (outcome.error) entry.errors.push(outcome.error)
  }


  // 鏈畬鎴愮户缁瓑
  if (entry.doneCount < entry.expectedTotal) return

  // 鍏ㄩ儴瀛愪换鍔″凡缁撶畻,鑱氬悎骞?finalize 鐖?transfer
  registry.delete(transferId)
  await finalizeParentTransfer(transferId, entry)
}

/**
 * 鍙栨秷鐖朵换鍔℃椂,鐩存帴閿€姣佽窡韪褰?瀛愪换鍔¤嚜宸变細鍦ㄦ墽琛屽紑濮嬪墠妫€鏌?status=canceled)
 */
export function dropTracker(transferId: number): void {
  if (registry.delete(transferId)) {
    log_p2p_info('transfer.children.dropped', { transferId })
  }
}

/** 鏌ヨ褰撳墠鏄惁鏈夊緟瀹屾垚鐨勫瓙浠诲姟(渚涜瘖鏂帴鍙ｇ敤) */
export function peekTracker(transferId: number): TrackerEntry | undefined {
  return registry.get(transferId)
}

async function finalizeParentTransfer(transferId: number, entry: TrackerEntry) {
  // 璇诲綋鍓?transfer,灏婇噸鐢ㄦ埛鍙兘宸茬粡瑙﹀彂鐨勫彇娑?
  const cur = await prisma.p2p_transfer.findUnique({
    where: { p2pTransferId: transferId },
    select: { status: true, downloadedBytes: true },
  })
  if (!cur) {
    log_p2p_info('transfer.children.finalize.missing', { transferId })
    return
  }

  let finalStatus: 'success' | 'failed' | 'canceled' = 'success'
  let errorMsg: string | null = null

  if (cur.status === 'canceled') {
    finalStatus = 'canceled'
  } else if (entry.failedCount > 0) {
    finalStatus = 'failed'
    const sample = entry.errors.slice(0, 3).join(' | ')
    errorMsg = `${entry.failedCount}/${entry.expectedTotal} 涓瓙浠诲姟澶辫触: ${sample}`
  } else if (entry.canceledCount === entry.expectedTotal) {
    finalStatus = 'canceled'
  }

  await prisma.p2p_transfer.update({
    where: { p2pTransferId: transferId },
    data: {
      status: finalStatus,
      progress: finalStatus === 'success' ? 100 : undefined,
      error: errorMsg,
      endTime: new Date(),
      speedBps: 0,
    },
  })
  log_p2p_info('transfer.children.finalized', {
    transferId,
    status: finalStatus,
    doneCount: entry.doneCount,
    failedCount: entry.failedCount,
    canceledCount: entry.canceledCount,
    expectedTotal: entry.expectedTotal,
  })
  if (finalStatus === 'failed') {
    log_p2p_error('transfer.children.finalize.failed', new Error(errorMsg || 'unknown'))
  }
}

