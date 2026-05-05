/**
 * P2P 拉取任务 - 多源并行版
 *
 * 核心模型:"漫画整树镜像复制 + 多节点并行下载"
 *  - 对端提供 /p2p/serve/manga/:id/tree 与 /p2p/serve/chapter/:id/tree 返回目录下全部文件清单
 *  - 客户端把所有文件扁平化为 FileTask 入池,N 个 seed = N 个 Worker 同时下载(真并行)
 *  - 不再按文件类型区分,zip/rar/cbz/cbr/pdf/epub/散图/series.json/.smanga/ 都原样复制
 *
 * 三种 transferType:
 *  - chapter: 拉取单个章节整棵树 -> receivedPath/<...tree>
 *  - manga:   拉取整本漫画整棵树 -> receivedPath/<...tree>
 *             (当 media.mediaType==0 即章节漫画时,本地额外套一层 mangaName/ 目录,对齐 sync 行为)
 *  - media:   拉取整个媒体库 -> receivedPath/<mangaName>/<...tree>,按漫画逐个展开
 *
 * 进度:按字节数计算 totalBytes / downloadedBytes,实时更新 speedBps
 */

import axios from 'axios'
import path from 'path'
import fs from 'fs'
import prisma from '#start/prisma'
import p2pIdentityService from './p2p_identity_service.js'
import { get_default_tracker_client } from './tracker_client.js'
import { P2PDownloadPool, type FileTask, type Seed } from './p2p_download_pool.js'

type P2PPullArgs = {
  transferId: number
}

type Headers = Record<string, string>

type TreeResponseData = {
  isSingleFile: boolean
  rootDir: string
  fileCount: number
  totalBytes: number
  files: Array<{ absPath: string; relPath: string; size: number; mtime: number }>
  // 漫画级独有
  mangaId?: number
  mangaName?: string
  mangaPath?: string
  // 章节级独有
  chapterId?: number
  chapterName?: string
  chapterPath?: string
}

/**
 * 从 axios 错误中提取详细信息
 */
function format_axios_error(err: any, context: string): string {
  const url = err?.config?.url || '(unknown url)'
  const method = (err?.config?.method || 'get').toUpperCase()
  const status = err?.response?.status
  const remoteMsg = err?.response?.data?.message
  const code = err?.code

  if (!status) {
    if (code === 'ECONNREFUSED') return `${context}: 对端拒绝连接 (${method} ${url})`
    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') return `${context}: 请求超时 (${method} ${url})`
    if (code === 'ENOTFOUND') return `${context}: 域名解析失败 (${method} ${url})`
    return `${context}: 网络错误 ${code || ''} (${method} ${url}) - ${err?.message}`
  }

  let hint = ''
  if (status === 401) hint = ' (握手信息缺失或时间戳过期)'
  else if (status === 403) hint = ' (对端 Tracker 鉴权拒绝)'
  else if (status === 404) hint = ' (资源不存在)'
  else if (status === 503) hint = ' (对端 P2P 服务未启用)'

  return `${context}: HTTP ${status}${hint} (${method} ${url}) - ${remoteMsg || err?.message}`
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

/** 将任意字符串做路径安全化(windows 非法字符替换) */
function safeName(name: string): string {
  return (
    String(name)
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/^\.+/, '_')
      .trim()
      .slice(0, 200) || 'unnamed'
  )
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
    console.log(`[p2p-pull] === 开始拉取任务 transferId=${this.transferId} ===`)

    const transfer = await prisma.p2p_transfer.findUnique({
      where: { p2pTransferId: this.transferId },
    })
    if (!transfer) {
      console.warn(`[p2p-pull] transfer ${this.transferId} not found`)
      return
    }
    if (transfer.status === 'canceled') {
      console.log(`[p2p-pull] transfer ${this.transferId} canceled`)
      return
    }

    console.log(
      `[p2p-pull] 任务 type=${transfer.transferType} groupNo=${transfer.groupNo} ` +
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

    const headers: Headers = {
      'X-Node-Id': identity.nodeId,
      'X-Group-No': groupNo,
      'X-Timestamp': String(Date.now()),
    }

    try {
      // 1. 通过 Tracker 发现 seeds
      await this.discoverSeeds(transfer)
      if (!this.seeds.length) {
        throw new Error('群组内未发现该资源的可用节点 (seeds 列表为空)')
      }
      console.log(
        `[p2p-pull] 发现 ${this.seeds.length} 个 seed: ` +
        this.seeds.map((s) => `${s.nodeName || s.nodeId}(${s.baseUrl})`).join(', ')
      )

      // 2. 展开所有 FileTask
      const allTasks = await this.expandAllTasks(headers, transfer)
      if (!allTasks.length) {
        throw new Error('展开后无文件可下载 (对端目录为空?)')
      }

      this.totalBytes = allTasks.reduce((a, t) => a + (t.size || 0), 0)
      console.log(
        `[p2p-pull] 共 ${allTasks.length} 个文件, totalBytes=${this.totalBytes}`
      )

      await prisma.p2p_transfer.update({
        where: { p2pTransferId: this.transferId },
        data: { totalBytes: BigInt(this.totalBytes) },
      })

      // 3. 启动下载池
      const pool = new P2PDownloadPool({
        headers,
        logTag: `p2p-pull#${this.transferId}`,
        onBytes: (delta) => this.onBytesDelta(delta),
        isCanceled: async () => {
          const cur = await prisma.p2p_transfer.findUnique({
            where: { p2pTransferId: this.transferId },
            select: { status: true },
          })
          return cur?.status === 'canceled'
        },
      })
      pool.enqueue(allTasks)
      await pool.run(this.seeds)

      // 4. 成功:标记完成
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
        `[p2p-pull] === 任务完成 transferId=${this.transferId} files=${allTasks.length} bytes=${pool.downloadedBytes()} ===`
      )
    } catch (e: any) {
      const detail = {
        message: e?.message,
        code: e?.code,
        url: e?.config?.url,
        httpStatus: e?.response?.status,
        remoteMessage: e?.response?.data?.message,
      }
      console.error(`[p2p-pull] === 任务失败 transferId=${this.transferId} ===`, detail)
      await this.fail(e?.message || String(e))
    }
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
    // 在线优先(tracker 已排序,这里保留原顺序即可)
    this.seeds = seeds
  }

  /**
   * 根据 transferType 展开所有 FileTask
   *  - chapter: 调 chapter/:id/tree
   *  - manga:   调 manga/:id/tree
   *  - media:   先 media/:id/mangas 拿漫画列表,再逐个 manga/:id/tree
   */
  private async expandAllTasks(
    headers: Headers,
    transfer: {
      transferType: string
      remoteMediaId: number | null
      remoteMangaId: number | null
      remoteChapterId: number | null
      receivedPath: string
    }
  ): Promise<FileTask[]> {
    this.ensureDir(transfer.receivedPath)

    if (transfer.transferType === 'chapter') {
      if (!transfer.remoteChapterId) throw new Error('remoteChapterId 缺失')
      const tree = await this.fetchChapterTree(headers, transfer.remoteChapterId)
      return this.treeToFileTasks(tree, transfer.receivedPath)
    }

    if (transfer.transferType === 'manga') {
      if (!transfer.remoteMangaId) throw new Error('remoteMangaId 缺失')
      const tree = await this.fetchMangaTree(headers, transfer.remoteMangaId)
      // 章节漫画:单本(isSingleFile=true)不套目录,多文件(目录结构漫画)套一层 mangaName/
      //   但因为 tree.files 的 relPath 已经是"相对 mangaPath 的结构",对于目录型漫画
      //   直接放到 receivedPath 会丢失漫画名;因此当 isSingleFile=false 时套一层 mangaName 目录
      const baseDir = tree.isSingleFile
        ? transfer.receivedPath
        : path.join(transfer.receivedPath, safeName(tree.mangaName || `manga_${tree.mangaId}`))
      return this.treeToFileTasks(tree, baseDir)
    }

    if (transfer.transferType === 'media') {
      if (!transfer.remoteMediaId) throw new Error('remoteMediaId 缺失')
      const mangas = await this.fetchMediaMangas(headers, transfer.remoteMediaId)
      if (!mangas.length) return []

      const allTasks: FileTask[] = []
      for (const m of mangas) {
        if (!m?.mangaId) continue
        let tree: TreeResponseData
        try {
          tree = await this.fetchMangaTree(headers, Number(m.mangaId))
        } catch (err: any) {
          console.warn(`[p2p-pull] 漫画 ${m.mangaName || m.mangaId} 获取 tree 失败,跳过: ${err.message || err}`)
          continue
        }
        const baseDir = tree.isSingleFile
          ? transfer.receivedPath
          : path.join(transfer.receivedPath, safeName(tree.mangaName || m.mangaName || `manga_${m.mangaId}`))
        allTasks.push(...this.treeToFileTasks(tree, baseDir))
      }
      return allTasks
    }

    throw new Error(`暂不支持的 transferType: ${transfer.transferType}`)
  }

  /** 调对端 /p2p/serve/manga/:id/tree,自动在多 seed 间 failover */
  private async fetchMangaTree(headers: Headers, mangaId: number): Promise<TreeResponseData> {
    return this.withSeedFailover(`获取漫画目录树 (mangaId=${mangaId})`, async (seed) => {
      const url = `${seed.baseUrl}/p2p/serve/manga/${mangaId}/tree`
      const res = await axios.get(url, { headers, timeout: 60 * 1000 })
      return res.data?.data as TreeResponseData
    })
  }

  /** 调对端 /p2p/serve/chapter/:id/tree */
  private async fetchChapterTree(headers: Headers, chapterId: number): Promise<TreeResponseData> {
    return this.withSeedFailover(`获取章节目录树 (chapterId=${chapterId})`, async (seed) => {
      const url = `${seed.baseUrl}/p2p/serve/chapter/${chapterId}/tree`
      const res = await axios.get(url, { headers, timeout: 60 * 1000 })
      return res.data?.data as TreeResponseData
    })
  }

  /** 调对端 /p2p/serve/media/:id/mangas */
  private async fetchMediaMangas(headers: Headers, mediaId: number): Promise<any[]> {
    return this.withSeedFailover(`获取媒体库漫画列表 (mediaId=${mediaId})`, async (seed) => {
      const url = `${seed.baseUrl}/p2p/serve/media/${mediaId}/mangas`
      const res = await axios.get(url, { headers, timeout: 30 * 1000 })
      return (res.data?.list ?? []) as any[]
    })
  }

  /** 把 tree 响应拍平成 FileTask 列表 */
  private treeToFileTasks(tree: TreeResponseData, baseLocalDir: string): FileTask[] {
    if (!tree?.files?.length) return []
    return tree.files.map((f) => ({
      remoteAbsPath: f.absPath,
      localPath: path.join(baseLocalDir, f.relPath.split('/').join(path.sep)),
      size: f.size || 0,
      attempts: 0,
    }))
  }

  /**
   * 元请求级 failover:获取 tree/mangas 时在所有 seed 之间逐个尝试,任一成功即返回
   * (下载文件的 failover 由 P2PDownloadPool 负责,这里只处理"列清单"这类一次性调用)
   */
  private async withSeedFailover<T>(
    context: string,
    fn: (seed: Seed) => Promise<T>
  ): Promise<T> {
    let lastErr: any = null
    for (const seed of this.seeds) {
      try {
        return await fn(seed)
      } catch (e: any) {
        const msg = format_axios_error(e, `${context} @ ${seed.nodeName || seed.nodeId}`)
        console.warn(`[p2p-pull] ${msg},尝试下一个 seed`)
        lastErr = new Error(msg)
      }
    }
    throw lastErr || new Error(`${context}: 所有 seed 均失败`)
  }

  /** 字节增量回调:累计总字节 + 节流上报进度和速率 */
  private onBytesDelta(delta: number) {
    this.downloadedBytes += delta
    const now = Date.now()
    // 节流:每 1s 上报一次
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

    // 异步更新,不阻塞下载
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
        console.warn(`[p2p-pull] 进度更新失败 transferId=${this.transferId}: ${e?.message || e}`)
      })
  }

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