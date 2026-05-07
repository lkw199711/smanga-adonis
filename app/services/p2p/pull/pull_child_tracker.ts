/**
 * 父任务子任务跟踪器(内存版)
 *
 * 用于 C 方案:父 Bull Job(PullMediaJob/PullMangaJob)通过 addTask 派发 N 个子任务后,
 * 需要等"最后一个子任务完成"时更新父 p2p_transfer 的最终状态。由于 Bull Job 执行完
 * 就返回,父 Job 进程内无法 await 子 Job 的完成,这里用模块级内存 Map 做引用计数。
 *
 * 工作流程(两层嵌套扁平化):
 *   MediaJob:
 *     1. initTracker(transferId, expected=N_mangas, totalBytes?)
 *     2. 派发 N 个 MangaJob(isSubTask=true)
 *   MangaJob(单文件):
 *     3. 下载完成后 notifyDone(transferId, {ok, bytes})
 *   MangaJob(目录,需要再拆):
 *     4. 调 transferSelfToChildren(transferId, childCount = 1+chapters.length)
 *        → 把自己的 1 个"预期位"替换为 childCount 个
 *     5. 派发 MetaJob + N ChapterJob(isSubTask=true)
 *   MetaJob / ChapterJob:
 *     6. 下载完成后 notifyDone(transferId, {ok, bytes})
 *   跟踪器:
 *     7. 当 doneCount >= expectedTotal 时聚合并 finalize 父 transfer
 *
 * 重启限制:
 *   模块级 Map 不持久化,进程重启会丢失计数,父 transfer 会永久卡在 running。
 *   TODO(future): 若需要容灾,改用 Redis 或落到 p2p_transfer 新字段。
 */

import prisma from '#start/prisma'

type ChildOutcome = {
  ok: boolean
  /** 该子任务累计下载字节数(仅成功的部分) */
  downloadedBytes: number
  /** 失败时的错误消息 */
  error?: string
  /** 被取消时为 true */
  canceled?: boolean
}

type TrackerEntry = {
  expectedTotal: number
  doneCount: number
  failedCount: number
  canceledCount: number
  errors: string[]
  /** 已聚合的下载字节数 */
  aggregatedBytes: number
  /** 记录创建时间,便于调试 */
  createdAt: number
  /** 父任务声明的 totalBytes(供日志/兜底,进度实时靠各子 Job 的 onBytes) */
  totalBytes: number
}

const registry = new Map<number, TrackerEntry>()

/**
 * 父 Job 初始化跟踪器
 * @param transferId     父 p2p_transfer 主键
 * @param expectedTotal  预期派发的子任务数量
 * @param totalBytes     父任务总字节数(可选,主要用于日志)
 */
export function initTracker(
  transferId: number,
  expectedTotal: number,
  totalBytes: number = 0
): void {
  if (expectedTotal <= 0) {
    // 没有子任务就不创建记录,父 Job 自行处理 transfer 状态
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
  console.log(
    `[pull-tracker] init transferId=${transferId} expected=${expectedTotal} totalBytes=${totalBytes}`
  )
}

/**
 * 中间层 Job(如 MangaJob)在派发真正子任务前调用,
 * 把自己占用的 1 个"预期位"替换为 childCount 个。
 *
 * 等价于:expectedTotal += (childCount - 1)
 *  - childCount=0  → expectedTotal -= 1(相当于"自己无子任务,直接完成")
 *                    调用方不应该再 notifyDone 自己
 *  - childCount=1  → expectedTotal 不变("自己退位,由唯一子任务接替")
 *  - childCount>1  → expectedTotal 增加
 *
 * 若调整后 doneCount >= expectedTotal,说明已经达到完成条件,主动触发 finalize。
 */
export async function transferSelfToChildren(
  transferId: number,
  childCount: number
): Promise<void> {
  const entry = registry.get(transferId)
  if (!entry) {
    console.warn(
      `[pull-tracker] transferSelfToChildren transferId=${transferId} 无跟踪记录,跳过`
    )
    return
  }
  const delta = childCount - 1
  const before = entry.expectedTotal
  entry.expectedTotal += delta
  console.log(
    `[pull-tracker] transferId=${transferId} 中间层展开: childCount=${childCount} ` +
      `expected ${before} → ${entry.expectedTotal}`
  )
  if (entry.doneCount >= entry.expectedTotal) {
    registry.delete(transferId)
    await finalizeParentTransfer(transferId, entry)
  }
}

/**
 * 子任务完成时通知(同一 transferId 每调用一次计数 +1)
 */
export async function notifyDone(
  transferId: number,
  outcome: ChildOutcome
): Promise<void> {
  const entry = registry.get(transferId)
  if (!entry) {
    // 两种情况:1) 单层任务(chapter/manga 自拉,没有走父子)不应该进入此分支
    //          2) 进程重启后丢失内存记录
    console.warn(
      `[pull-tracker] notifyDone transferId=${transferId} 无跟踪记录(可能已重启或非子任务场景)`
    )
    return
  }

  entry.doneCount += 1
  entry.aggregatedBytes += outcome.downloadedBytes || 0
  if (outcome.canceled) entry.canceledCount += 1
  else if (!outcome.ok) {
    entry.failedCount += 1
    if (outcome.error) entry.errors.push(outcome.error)
  }

  console.log(
    `[pull-tracker] transferId=${transferId} 进度 ${entry.doneCount}/${entry.expectedTotal} ` +
      `(fail=${entry.failedCount} cancel=${entry.canceledCount}) bytes+=${outcome.downloadedBytes || 0}`
  )

  // 未完成继续等
  if (entry.doneCount < entry.expectedTotal) return

  // 全部子任务已结算,聚合并 finalize 父 transfer
  registry.delete(transferId)
  await finalizeParentTransfer(transferId, entry)
}

/**
 * 取消父任务时,直接销毁跟踪记录(子任务自己会在执行开始前检查 status=canceled)
 */
export function dropTracker(transferId: number): void {
  if (registry.delete(transferId)) {
    console.log(`[pull-tracker] drop transferId=${transferId}`)
  }
}

/** 查询当前是否有待完成的子任务(供诊断接口用) */
export function peekTracker(transferId: number): TrackerEntry | undefined {
  return registry.get(transferId)
}

async function finalizeParentTransfer(transferId: number, entry: TrackerEntry) {
  // 读当前 transfer,尊重用户可能已经触发的取消
  const cur = await prisma.p2p_transfer.findUnique({
    where: { p2pTransferId: transferId },
    select: { status: true, downloadedBytes: true },
  })
  if (!cur) {
    console.warn(`[pull-tracker] finalize transferId=${transferId} 记录不存在`)
    return
  }

  let finalStatus: 'success' | 'failed' | 'canceled' = 'success'
  let errorMsg: string | null = null

  if (cur.status === 'canceled') {
    finalStatus = 'canceled'
  } else if (entry.failedCount > 0) {
    finalStatus = 'failed'
    const sample = entry.errors.slice(0, 3).join(' | ')
    errorMsg = `${entry.failedCount}/${entry.expectedTotal} 个子任务失败: ${sample}`
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
  console.log(
    `[pull-tracker] finalize transferId=${transferId} → ${finalStatus} ` +
      `(done=${entry.doneCount} fail=${entry.failedCount} cancel=${entry.canceledCount})`
  )
}