/**
 * 子任务公共工具:seeds 发现、鉴权头构造、小下载池工厂、进度上报
 *
 * 每个子 Bull Job(PullChapterJob/PullMetaJob 等)开头都要做相同的准备动作,
 * 本文件把它们抽成独立函数,避免重复。
 */

import fs from 'fs'
import prisma from '#start/prisma'
import p2pIdentityService from '../p2p_identity_service.js'
import { get_default_tracker_client } from '../tracker_client.js'
import {
  P2PDownloadPool,
  type FileTask,
  type Seed,
} from '../p2p_download_pool.js'
import type { DiscoverSeedsArgs, PullHeaders } from './pull_context.js'
import { normalize_public_url } from '#utils/ip_resolver'
import { reconcileSingleGroupIfMissing } from '../p2p_group_reconcile_service.js'

export type PullBaseArgs = {
  /** 父 p2p_transfer 主键 */
  transferId: number
  /** 群号(从 transfer 读也可,但 addTask 时就带上更便捷) */
  groupNo: string
}

/** 构造鉴权头 */
export function buildHeaders(groupNo: string): PullHeaders {
  const identity = p2pIdentityService.getIdentity()
  if (!identity) {
    throw new Error('本节点未完成身份注册')
  }
  return {
    'X-Node-Id': identity.nodeId,
    'X-Group-No': groupNo,
    'X-Timestamp': String(Date.now()),
  }
}

/**
 * 拼装 seed 的可访问 baseUrl(public 优先,local 回落)
 * publicUrl 已由 tracker 保证为 "http(s)://host:port" 形态,直接规范化使用
 */
function pickBaseUrl(seed: {
  publicUrl: string | null
  localHost: string | null
  localPort: number | null
}): string {
  if (seed.publicUrl) {
    const normalized = normalize_public_url(seed.publicUrl)
    if (normalized) return normalized
  }
  if (seed.localHost && seed.localPort) {
    return `http://${seed.localHost}:${seed.localPort}`.replace(/\/+$/, '')
  }
  return ''
}

/**
 * seeds 解析:优先使用上游已发现的 seeds(避免对每本 manga / 每章节都去查一次 tracker),
 * 仅在未透传时回落到 tracker 查询。
 *
 * 设计目的(关键):
 *  - 上游 MediaJob 已用 shareType=media 拿到了权威的 seeds,这些节点都对该 media 做过共享,
 *    其下所有 manga / chapter 也属于该 media,因此可直接复用而不必让 tracker 维护
 *    "manga→media 归属"这种会随时变脏的派生信息。
 *  - 只有在用户从分享列表直接拉某一本 manga / 单章节(没有 media 父任务的入口)时,
 *    才会落到 discoverSeeds 兜底,此时对端必然做了 manga 级共享,索引就能命中。
 */
export async function resolveSeeds(
  inheritedSeeds: Seed[] | undefined,
  fallbackArgs: DiscoverSeedsArgs,
  logTag?: string
): Promise<Seed[]> {
  if (inheritedSeeds && inheritedSeeds.length) {
    if (logTag) {
      console.log(`[${logTag}] 复用上游 seeds: ${inheritedSeeds.length} 个`)
    }
    return inheritedSeeds
  }
  return discoverSeeds(fallbackArgs)
}

/**
 * 通过 Tracker 发现 seeds 池
 */
export async function discoverSeeds(args: DiscoverSeedsArgs): Promise<Seed[]> {
  const tracker = get_default_tracker_client()
  if (!tracker) throw new Error('未配置 tracker,无法发现 seeds')

  const queryParams: {
    shareType: 'media' | 'manga' | 'chapter'
    remoteMediaId?: number
    remoteMangaId?: number
  } = {
    shareType: args.shareType,
  }
  if (args.shareType === 'media') {
    if (!args.remoteMediaId) throw new Error('remoteMediaId 缺失')
    queryParams.remoteMediaId = args.remoteMediaId
  } else {
    if (!args.remoteMangaId) throw new Error('remoteMangaId 缺失,无法发现 seeds')
    queryParams.remoteMangaId = args.remoteMangaId
  }

  let raw: any[] = []
  try {
    raw = await tracker.findSeeds(args.groupNo, queryParams)
  } catch (e: any) {
    // 检测 "群组不存在/已停用" 这类错误 → 触发单群对账兜底,清理本地幽灵群
    const status = e?.response?.status
    const remoteMsg: string = e?.response?.data?.message || ''
    const isGroupMissing =
      status === 404 ||
      /群组不存在|已停用|group.*not.*found/i.test(remoteMsg)
    if (isGroupMissing) {
      // 异步清理,不阻塞当前抛错流程(本次拉取就是要失败的)
      reconcileSingleGroupIfMissing(args.groupNo).catch(() => {})
    }
    throw e
  }
  const seeds: Seed[] = []
  for (const r of raw || []) {
    const baseUrl = pickBaseUrl(r)
    if (!baseUrl) continue
    seeds.push({
      nodeId: r.nodeId,
      nodeName: r.nodeName,
      baseUrl,
    })
  }
  return seeds
}

/**
 * 查询当前 transfer 是否被取消(给 pool 的 isCanceled 用)
 */
export async function isTransferCanceled(transferId: number): Promise<boolean> {
  const cur = await prisma.p2p_transfer.findUnique({
    where: { p2pTransferId: transferId },
    select: { status: true },
  })
  return cur?.status === 'canceled'
}

/**
 * 父 transfer 进度上报封装(原子增量)
 *
 * - downloadedBytes 使用 increment,避免多子任务同时更新时丢数据
 * - speedBps 只记录最近一次调用值(非聚合,够用)
 * - progress 根据 downloadedBytes / totalBytes 就地计算
 */
export async function bumpProgress(
  transferId: number,
  deltaBytes: number,
  speedBps: number
): Promise<void> {
  if (deltaBytes <= 0 && speedBps === 0) return
  try {
    // 先原子增加 downloadedBytes
    const updated = await prisma.p2p_transfer.update({
      where: { p2pTransferId: transferId },
      data: {
        downloadedBytes: { increment: BigInt(Math.max(0, Math.floor(deltaBytes))) },
        speedBps,
      },
      select: { downloadedBytes: true, totalBytes: true },
    })
    // 再根据最新值更新 progress(无需精确,避免过频)
    const total = updated.totalBytes ? Number(updated.totalBytes) : 0
    const downloaded = Number(updated.downloadedBytes || 0n)
    if (total > 0) {
      const progress = Math.min(99, Math.floor((downloaded / total) * 100))
      await prisma.p2p_transfer.update({
        where: { p2pTransferId: transferId },
        data: { progress },
      })
    }
  } catch (e: any) {
    console.warn(`[pull-shared] bumpProgress transferId=${transferId} 失败: ${e?.message || e}`)
  }
}

/**
 * 创建一个节流的进度上报器
 *  - 每 1s 最多触发一次 DB 写
 *  - 字节增量在节流窗口内累加,窗口末尾一次性上报
 *  - 窗口内按 bytes/elapsed 计算瞬时速率
 */
export function createThrottledProgressReporter(transferId: number) {
  let accBytes = 0
  let windowStart = 0

  const report = async () => {
    if (accBytes <= 0) return
    const elapsed = Math.max(1, Date.now() - windowStart)
    const speedBps = Math.floor((accBytes * 1000) / elapsed)
    const bytesToFlush = accBytes
    accBytes = 0
    windowStart = Date.now()
    await bumpProgress(transferId, bytesToFlush, speedBps)
  }

  return {
    /** 收到字节,按需触发上报 */
    onBytes: (delta: number) => {
      if (windowStart === 0) {
        windowStart = Date.now()
      }
      accBytes += delta
      if (Date.now() - windowStart >= 1000) {
        // fire-and-forget;下一次调用会自然被节流
        report().catch(() => {})
      }
    },
    /** 执行结束时冲刷剩余字节 */
    flush: async () => {
      await report()
    },
  }
}

/**
 * 构造一个小下载池(单个子任务用)
 */
export function createChildPool(opts: {
  transferId: number
  headers: PullHeaders
  logTag: string
  onBytes: (delta: number) => void
}): P2PDownloadPool {
  return new P2PDownloadPool({
    headers: opts.headers,
    logTag: opts.logTag,
    onBytes: opts.onBytes,
    isCanceled: async () => isTransferCanceled(opts.transferId),
  })
}

/** 确保目录存在 */
export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * 单文件完整性校验结果
 */
export type FileVerifyOutcome =
  | 'ok'           // 已存在且 size 一致 → 跳过
  | 'missing'      // 本地不存在 → 需下载
  | 'mismatch'     // size 不一致 → 已删除,需重新下载
  | 'unknown_size' // 服务端 size=0 (无法校验),按本地存在与否处理

/**
 * 校验单个本地文件的完整性
 *  - size>0 时严格比对(不一致直接删除)
 *  - size==0 时不删除,仅根据存在与否返回状态
 */
export function verifyLocalFile(
  localPath: string,
  expectedSize: number
): FileVerifyOutcome {
  if (!fs.existsSync(localPath)) return 'missing'
  let st: fs.Stats
  try {
    st = fs.statSync(localPath)
  } catch {
    return 'missing'
  }
  if (!st.isFile()) {
    // 非文件(可能是错位的目录)→ 视为缺失,但不主动删
    return 'missing'
  }
  if (expectedSize <= 0) {
    return st.size > 0 ? 'unknown_size' : 'missing'
  }
  if (st.size !== expectedSize) {
    // 校验失败:删除残留以便后续重新下载
    try { fs.unlinkSync(localPath) } catch {}
    return 'mismatch'
  }
  return 'ok'
}

/**
 * 批量预校验:在下载开始前对 tasks 中已存在的本地文件做完整性校验
 *  - 校验通过的 task 从清单中剔除(无需重下)
 *  - 校验失败的本地文件已被删除,task 保留参与下载
 *
 * @returns 过滤后剩余的待下载 tasks,以及统计信息
 */
export function preVerifyTasks(
  tasks: FileTask[],
  logTag: string
): { remaining: FileTask[]; skipped: number; mismatched: number } {
  let skipped = 0
  let mismatched = 0
  const remaining: FileTask[] = []
  for (const t of tasks) {
    const outcome = verifyLocalFile(t.localPath, t.size)
    if (outcome === 'ok') {
      skipped += 1
      continue
    }
    if (outcome === 'mismatch') {
      mismatched += 1
      console.warn(`[${logTag}] 预校验失败,已删除残留: ${t.localPath} (期望 size=${t.size})`)
    }
    remaining.push(t)
  }
  if (skipped || mismatched) {
    console.log(
      `[${logTag}] 预校验完成: 跳过已存在=${skipped}, 删除残缺=${mismatched}, 待下载=${remaining.length}`
    )
  }
  return { remaining, skipped, mismatched }
}

/**
 * 收尾校验:下载结束后再核对一次所有目标文件
 *  - 任一文件校验失败(size 不一致 / 缺失)即抛错,由上层进入失败状态
 *  - 校验失败的残留文件会被删除,留待下次重试时重新下载
 */
export function postVerifyTasks(
  tasks: FileTask[],
  logTag: string
): { ok: boolean; failed: Array<{ task: FileTask; reason: FileVerifyOutcome }> } {
  const failed: Array<{ task: FileTask; reason: FileVerifyOutcome }> = []
  for (const t of tasks) {
    const outcome = verifyLocalFile(t.localPath, t.size)
    if (outcome === 'ok' || outcome === 'unknown_size') continue
    failed.push({ task: t, reason: outcome })
  }
  if (failed.length) {
    const sample = failed.slice(0, 3)
      .map((f) => `${f.task.localPath}(${f.reason})`)
      .join('; ')
    console.warn(
      `[${logTag}] 收尾校验失败 ${failed.length}/${tasks.length},例如: ${sample}`
    )
  } else {
    console.log(`[${logTag}] 收尾校验通过 (${tasks.length} 个文件)`)
  }
  return { ok: failed.length === 0, failed }
}

/**
 * 组合:seeds 发现 + 构造 headers + 小下载池,完成"跑 FileTask 清单"的通用流程
 *
 * 流程:
 *  1. 预校验:size 一致的文件直接跳过;不一致的删除残留后重下;缺失的进入下载队列
 *  2. 启动下载池
 *  3. 收尾校验:核对所有目标文件,任一失败抛错(已下载坏文件已被删除,下次重试时会重新下)
 *
 * @returns 下载字节数(成功那部分)
 */
export async function runChildDownload(opts: {
  transferId: number
  groupNo: string
  discoverArgs: DiscoverSeedsArgs
  /** 上游已发现的 seeds。提供时优先复用,避免重复查 tracker */
  inheritedSeeds?: Seed[]
  tasks: FileTask[]
  logTag: string
  reporter: ReturnType<typeof createThrottledProgressReporter>
}): Promise<number> {
  if (!opts.tasks.length) return 0

  // 1) 下载前预校验:剔除已完整存在的文件,删除 size 不一致的残留
  const { remaining } = preVerifyTasks(opts.tasks, opts.logTag)

  // 全部已存在,直接做一次收尾校验后返回
  if (!remaining.length) {
    const post = postVerifyTasks(opts.tasks, opts.logTag)
    if (!post.ok) {
      throw new Error(
        `下载已跳过但收尾校验失败: ${post.failed.length} 个文件不一致,已删除残缺文件,请重试`
      )
    }
    return 0
  }

  const headers = buildHeaders(opts.groupNo)
  const seeds = await resolveSeeds(opts.inheritedSeeds, opts.discoverArgs, opts.logTag)
  if (!seeds.length) {
    throw new Error('群组内未发现该资源的可用节点 (seeds 列表为空)')
  }
  console.log(
    `[${opts.logTag}] 发现 ${seeds.length} 个 seed,开始下载 ${remaining.length} 个文件 ` +
    `(总计划 ${opts.tasks.length} 个,已跳过 ${opts.tasks.length - remaining.length} 个)`
  )

  const pool = createChildPool({
    transferId: opts.transferId,
    headers,
    logTag: opts.logTag,
    onBytes: opts.reporter.onBytes,
  })
  pool.enqueue(remaining)
  await pool.run(seeds)
  await opts.reporter.flush()

  // 2) 收尾校验:核对全量(包括预校验跳过的)目标文件
  const post = postVerifyTasks(opts.tasks, opts.logTag)
  if (!post.ok) {
    throw new Error(
      `下载完成但收尾校验失败: ${post.failed.length} 个文件不一致,已删除残缺文件,请重试以触发断点续传`
    )
  }

  return pool.downloadedBytes()
}