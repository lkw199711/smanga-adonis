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

  const raw = await tracker.findSeeds(args.groupNo, queryParams)
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
 * 组合:seeds 发现 + 构造 headers + 小下载池,完成"跑 FileTask 清单"的通用流程
 *
 * @returns 下载字节数(成功那部分)
 */
export async function runChildDownload(opts: {
  transferId: number
  groupNo: string
  discoverArgs: DiscoverSeedsArgs
  tasks: FileTask[]
  logTag: string
  reporter: ReturnType<typeof createThrottledProgressReporter>
}): Promise<number> {
  if (!opts.tasks.length) return 0

  const headers = buildHeaders(opts.groupNo)
  const seeds = await discoverSeeds(opts.discoverArgs)
  if (!seeds.length) {
    throw new Error('群组内未发现该资源的可用节点 (seeds 列表为空)')
  }
  console.log(
    `[${opts.logTag}] 发现 ${seeds.length} 个 seed,开始下载 ${opts.tasks.length} 个文件`
  )

  const pool = createChildPool({
    transferId: opts.transferId,
    headers,
    logTag: opts.logTag,
    onBytes: opts.reporter.onBytes,
  })
  pool.enqueue(opts.tasks)
  await pool.run(seeds)
  await opts.reporter.flush()
  return pool.downloadedBytes()
}