/**
 * P2P 拉取任务 - 父调度器(方案 B:子任务按阶段展开,不持久化)
 *
 * 三种 transferType 对应的子任务链:
 *   - chapter: [PullChapterSubJob]
 *   - manga:   [PullMangaSubJob]  (内部派生 PullMetaSubJob)
 *   - media:   [PullMediaSubJob]  (内部为每本漫画派生 PullMangaSubJob → PullMetaSubJob)
 *
 * 拆分要点(对多节点并行特性无影响):
 *  - 子任务只负责"调 tree + 把文件清单入池",展开阶段串行(避免对端 N 路压力)
 *  - 所有 FileTask 共享同一个 P2PDownloadPool,真正下载仍由 N 个 seed-Worker 并行消费
 *  - 元数据(.smanga/、series.json、ComicInfo.xml、cover.*)作为独立逻辑分组,
 *    与漫画正文一起进同一个 pool,日志可区分
 *
 * 进度:按字节数计算 totalBytes / downloadedBytes,实时更新 speedBps
 */

import fs from 'fs'
import prisma from '#start/prisma'
import p2pIdentityService from './p2p_identity_service.js'
import { get_default_tracker_client } from './tracker_client.js'
import { P2PDownloadPool, type Seed } from './p2p_download_pool.js'
import type { IPullSubJob, PullContext, PullHeaders } from './pull/pull_context.js'
import { PullChapterSubJob } from './pull/pull_chapter_sub_job.js'
import { PullMangaSubJob } from './pull/pull_manga_sub_job.js'
import { PullMediaSubJob } from './pull/pull_media_sub_job.js'
import { format_axios_error } from './pull/pull_tree_fetcher.js'

type P2PPullArgs = {
  transferId: number
}

/**
 * 拼装 seed 的可访问 baseUrl(public 优先,local 回落)
 */
function pickBaseUrl(seed: {
  publicHost: string | null
  publicPort: number | null
  localHost: string | null
  localPort: number | null
}): string {
  if (seed.publicHost && seed.publicPort) {
    return `http://${seed.publicHost}:${seed.publicPort}`.replace(/\/+$/, '')
  }
  if (seed.localHost && seed.localPort) {
    return `http://${seed.localHost}:${seed.localPort}`.replace(/\/+$/, '')
  }
  return ''
}

export default class P2PPullJob {
  private transferId: number
  private seeds: Seed[] = []

  // 进度相关
  private totalBytes: number = 0
  private downloadedBytes: number = 0
  private lastReportTime: number = 0
  private lastReportBytes: number = 0
  private lastSpeedBps: number = 0

  constructor(args: P2PPullArgs) {
    this.transferId = args.transferId
  }

  async run() {
    const logTag = `p2p-pull#${this.transferId}`
    console.log(`[${logTag}] === 开始拉取任务 ===`)

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

    console.log(
      `[${logTag}] type=${transfer.transferType} groupNo=${transfer.groupNo} ` +
      `mediaId=${transfer.remoteMediaId} mangaId=${transfer.remoteMangaId} chapterId=${transfer.remoteChapterId} ` +
      `receivedPath=${transfer.receivedPath}`
    )

    const identity = p2pIdentityService.getIdentity()
    if (!identity) {
      await this.fail('本节点未完成身份注册')
      return
    }

    const groupNo = transfer.groupNo
    if (!groupNo) {
      await this.fail('transfer.groupNo 缺失')
      return
    }

    await prisma.p2p_transfer.update({
      where: { p2pTransferId: transfer.p2pTransferId },
      data: { status: 'running', startTime: new Date(), progress: 0, downloadedBytes: 0n, speedBps: 0 },
    })

    const headers: PullHeaders = {
      'X-Node-Id': identity.nodeId,
      'X-Group-No': groupNo,
      'X-Timestamp': String(Date.now()),
    }

    try {
      // ============ 阶段 1:通过 Tracker 发现 seeds ============
      await this.discoverSeeds(transfer)
      if (!this.seeds.length) {
        throw new Error('群组内未发现该资源的可用节点 (seeds 列表为空)')
      }
      console.log(
        `[${logTag}] 发现 ${this.seeds.length} 个 seed: ` +
        this.seeds.map((s) => `${s.nodeName || s.nodeId}(${s.baseUrl})`).join(', ')
      )

      // ============ 阶段 2:准备下载池 + 上下文 ============
      this.ensureDir(transfer.receivedPath)

      const pool = new P2PDownloadPool({
        headers,
        logTag,
        onBytes: (delta) => this.onBytesDelta(delta),
        isCanceled: async () => this.queryCanceled(),
      })

      const ctx: PullContext = {
        transferId: this.transferId,
        seeds: this.seeds,
        headers,
        pool,
        receivedPath: transfer.receivedPath,
        isCanceled: async () => this.queryCanceled(),
        logTag,
        enqueuedBytes: 0,
      }

      // ============ 阶段 3:按 transferType 选择子任务链并展开(串行 tree) ============
      const subJobs = this.buildSubJobs(transfer)
      console.log(`[${logTag}] 子任务链: ${subJobs.map((j) => j.name).join(' → ')}`)

      let totalFiles = 0
      for (const job of subJobs) {
        totalFiles += await job.prepare(ctx)
      }

      const pending = pool.pendingCount()
      if (pending === 0) {
        throw new Error('展开后无文件可下载 (对端目录为空?)')
      }

      this.totalBytes = ctx.enqueuedBytes
      console.log(
        `[${logTag}] 阶段展开完成: 子任务总入池=${totalFiles}, 最终队列=${pending}, totalBytes=${this.totalBytes}`
      )

      await prisma.p2p_transfer.update({
        where: { p2pTransferId: this.transferId },
        data: { totalBytes: BigInt(this.totalBytes) },
      })

      // ============ 阶段 4:多节点并行下载 ============
      await pool.run(this.seeds)

      // ============ 阶段 5:成功落库 ============
      await prisma.p2p_transfer.update({
        where: { p2pTransferId: transfer.p2pTransferId },
        data: {
          status: 'success',
          progress: 100,
          downloadedBytes: BigInt(pool.downloadedBytes()),
          speedBps: 0,
          endTime: new Date(),
        },
      })
      console.log(
        `[${logTag}] === 任务完成 files=${totalFiles} bytes=${pool.downloadedBytes()} ===`
      )
    } catch (e: any) {
      const detail = {
        message: e?.message,
        code: e?.code,
        url: e?.config?.url,
        httpStatus: e?.response?.status,
        remoteMessage: e?.response?.data?.message,
      }
      console.error(`[${logTag}] === 任务失败 ===`, detail)
      await this.fail(e?.message || String(e))
    }
  }

  /** 根据 transferType 构造子任务链(仅含顶层,子任务内部会再派生更细的子任务) */
  private buildSubJobs(transfer: {
    transferType: string
    remoteMediaId: number | null
    remoteMangaId: number | null
    remoteChapterId: number | null
    receivedPath: string
  }): IPullSubJob[] {
    if (transfer.transferType === 'chapter') {
      if (!transfer.remoteChapterId) throw new Error('remoteChapterId 缺失')
      return [new PullChapterSubJob(transfer.remoteChapterId, transfer.receivedPath)]
    }

    if (transfer.transferType === 'manga') {
      if (!transfer.remoteMangaId) throw new Error('remoteMangaId 缺失')
      return [new PullMangaSubJob(transfer.remoteMangaId, transfer.receivedPath)]
    }

    if (transfer.transferType === 'media') {
      if (!transfer.remoteMediaId) throw new Error('remoteMediaId 缺失')
      return [new PullMediaSubJob(transfer.remoteMediaId, transfer.receivedPath)]
    }

    throw new Error(`暂不支持的 transferType: ${transfer.transferType}`)
  }

  /**
   * 通过 Tracker 发现 seeds 池
   */
  private async discoverSeeds(transfer: {
    groupNo: string
    transferType: string
    remoteMediaId: number | null
    remoteMangaId: number | null
  }) {
    const tracker = get_default_tracker_client()
    if (!tracker) throw new Error('未配置 tracker,无法发现 seeds')

    const queryParams: {
      shareType: 'media' | 'manga' | 'chapter'
      remoteMediaId?: number
      remoteMangaId?: number
    } = {
      shareType: transfer.transferType as 'media' | 'manga' | 'chapter',
    }
    if (transfer.transferType === 'media') {
      if (!transfer.remoteMediaId) throw new Error('remoteMediaId 缺失')
      queryParams.remoteMediaId = transfer.remoteMediaId
    } else {
      if (!transfer.remoteMangaId) throw new Error('remoteMangaId 缺失,无法发现 seeds')
      queryParams.remoteMangaId = transfer.remoteMangaId
    }

    let raw: Awaited<ReturnType<typeof tracker.findSeeds>> = []
    try {
      raw = await tracker.findSeeds(transfer.groupNo, queryParams)
    } catch (e: any) {
      throw new Error(format_axios_error(e, '查询 Tracker seeds 列表'))
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
    this.seeds = seeds
  }

  /** 查询当前 transfer 是否被取消 */
  private async queryCanceled(): Promise<boolean> {
    const cur = await prisma.p2p_transfer.findUnique({
      where: { p2pTransferId: this.transferId },
      select: { status: true },
    })
    return cur?.status === 'canceled'
  }

  /** 字节增量回调:累计总字节 + 节流上报进度和速率 */
  private onBytesDelta(delta: number) {
    this.downloadedBytes += delta
    const now = Date.now()
    if (this.lastReportTime === 0) {
      this.lastReportTime = now
      this.lastReportBytes = this.downloadedBytes
      return
    }
    const elapsed = now - this.lastReportTime
    if (elapsed < 1000) return

    const bytesDelta = this.downloadedBytes - this.lastReportBytes
    this.lastSpeedBps = Math.floor((bytesDelta * 1000) / elapsed)
    this.lastReportTime = now
    this.lastReportBytes = this.downloadedBytes

    const progress = this.totalBytes > 0
      ? Math.min(99, Math.floor((this.downloadedBytes / this.totalBytes) * 100))
      : 0

    prisma.p2p_transfer
      .update({
        where: { p2pTransferId: this.transferId },
        data: {
          progress,
          downloadedBytes: BigInt(this.downloadedBytes),
          speedBps: this.lastSpeedBps,
        },
      })
      .catch((e) => {
        console.warn(`[p2p-pull#${this.transferId}] 进度更新失败: ${e?.message || e}`)
      })
  }

  // (sumPoolBytes 已移除:改由子任务通过 enqueueTasks 同步累加 ctx.enqueuedBytes)

  private async fail(msg: string) {
    await prisma.p2p_transfer.update({
      where: { p2pTransferId: this.transferId },
      data: { status: 'failed', error: msg, endTime: new Date(), speedBps: 0 },
    })
  }

  private ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
}