/**
 * P2P 拉取任务 - 多源版本
 *
 * 支持三种 transferType:
 *  - chapter: 拉取单个章节的所有图片到 receivedPath/
 *  - manga:   拉取整本漫画(下属所有章节),结构 receivedPath/<chapterName>/<files>
 *  - media:   拉取整个媒体库(下属所有漫画的所有章节),结构 receivedPath/<mangaName>/<chapterName>/<files>
 *
 * 多源策略 (方案 A: 轮询 + 失败换源):
 *  1. 任务启动时通过 Tracker.findSeeds 获取群组内拥有该资源的所有节点 (seeds)
 *  2. 每次发起请求(列章节/列漫画/列图片/下载文件)使用 round-robin 选择 seed
 *  3. 单次请求失败时尝试下一个 seed,所有 seed 全部失败才视为该请求失败
 *  4. 失败的 seed 在本次任务内进入"短期屏蔽列表",避免反复重试导致超时累积
 *
 * baseUrl 选择:每个 seed 优先 publicHost:publicPort,回落 localHost:localPort
 *
 * 注意:
 *  - 不再依赖 transfer.peerBaseUrl(已删除)/peerNodeId
 *  - 仅依赖本地 p2p_identity (X-Node-Id / X-Group-No / X-Timestamp) 与 seeds 池
 */

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import prisma from '#start/prisma'
import p2pIdentityService from './p2p_identity_service.js'
import { get_default_tracker_client } from './tracker_client.js'

type P2PPullArgs = {
  transferId: number
}

type Headers = Record<string, string>

type ChapterTask = {
  remoteChapterId: number
  saveDir: string
}

type Seed = {
  nodeId: string
  nodeName: string | null
  online: number
  publicHost: string | null
  publicPort: number | null
  localHost: string | null
  localPort: number | null
  baseUrl: string // 计算后的可用 baseUrl
}

/**
 * 从 axios 错误中提取详细信息,生成可读性强的错误描述
 */
function format_axios_error(err: any, context: string): string {
  const url = err?.config?.url || '(unknown url)'
  const method = (err?.config?.method || 'get').toUpperCase()
  const status = err?.response?.status
  const remoteMsg = err?.response?.data?.message
  const remoteData = err?.response?.data
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

  const dataStr = remoteData && typeof remoteData === 'object' ? JSON.stringify(remoteData) : ''
  return `${context}: HTTP ${status}${hint} (${method} ${url}) - ${remoteMsg || err?.message}${dataStr ? ' | data=' + dataStr : ''}`
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

  // seeds 池:运行时刷新
  private seeds: Seed[] = []
  // 轮询游标
  private cursor: number = 0
  // 失败次数(本次任务内,超过阈值则跳过该 seed)
  private failureCounter = new Map<string, number>()
  private readonly MAX_FAILURE_PER_SEED = 3

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
      `[p2p-pull] 任务详情 type=${transfer.transferType} ` +
      `groupNo=${transfer.groupNo} ` +
      `remoteName=${transfer.remoteName} ` +
      `mediaId=${transfer.remoteMediaId} ` +
      `mangaId=${transfer.remoteMangaId} ` +
      `chapterId=${transfer.remoteChapterId} ` +
      `receivedPath=${transfer.receivedPath}`
    )

    const identity = p2pIdentityService.getIdentity()
    if (!identity) {
      await this.fail('本节点未完成身份注册')
      return
    }
    console.log(`[p2p-pull] 本节点身份 nodeId=${identity.nodeId} nodeName=${identity.nodeName}`)

    const groupNo = transfer.groupNo
    if (!groupNo) {
      await this.fail('transfer.groupNo 缺失')
      return
    }

    await prisma.p2p_transfer.update({
      where: { p2pTransferId: transfer.p2pTransferId },
      data: { status: 'running', startTime: new Date() },
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
        throw new Error('群组内未发现该资源的可用节点 (seeds 列表为空,请确认对端已开启共享并在线)')
      }
      console.log(
        `[p2p-pull] 发现 ${this.seeds.length} 个 seed: ` +
        this.seeds.map((s) => `${s.nodeName || s.nodeId}(online=${s.online}, ${s.baseUrl})`).join(', ')
      )

      // 2. 展开章节任务
      let chapterTasks: ChapterTask[] = []
      if (transfer.transferType === 'chapter') {
        if (!transfer.remoteChapterId) throw new Error('remoteChapterId 缺失')
        chapterTasks = [
          {
            remoteChapterId: transfer.remoteChapterId,
            saveDir: transfer.receivedPath,
          },
        ]
      } else if (transfer.transferType === 'manga') {
        if (!transfer.remoteMangaId) throw new Error('remoteMangaId 缺失')
        chapterTasks = await this.expandMangaTasks(headers, transfer.remoteMangaId, transfer.receivedPath)
      } else if (transfer.transferType === 'media') {
        if (!transfer.remoteMediaId) throw new Error('remoteMediaId 缺失')
        chapterTasks = await this.expandMediaTasks(headers, transfer.remoteMediaId, transfer.receivedPath)
      } else {
        throw new Error(`暂不支持的 transferType: ${transfer.transferType}`)
      }

      if (!chapterTasks.length) {
        throw new Error('对端无可下载章节 (列表为空)')
      }
      console.log(`[p2p-pull] 共 ${chapterTasks.length} 个章节待下载`)

      // 3. 逐章节下载,以章节为粒度刷新进度
      let doneChapters = 0
      const totalChapters = chapterTasks.length
      for (const task of chapterTasks) {
        const cur = await prisma.p2p_transfer.findUnique({
          where: { p2pTransferId: this.transferId },
          select: { status: true },
        })
        if (cur?.status === 'canceled') {
          console.log(`[p2p-pull] transfer ${this.transferId} canceled mid-way`)
          return
        }

        console.log(
          `[p2p-pull] (${doneChapters + 1}/${totalChapters}) 拉取章节 ` +
          `remoteChapterId=${task.remoteChapterId} -> ${task.saveDir}`
        )

        try {
          await this.pullChapterImages(headers, task.remoteChapterId, task.saveDir)
        } catch (chErr: any) {
          throw new Error(
            `章节 remoteChapterId=${task.remoteChapterId} 下载失败: ${chErr?.message || chErr}`
          )
        }
        doneChapters++

        await prisma.p2p_transfer.update({
          where: { p2pTransferId: this.transferId },
          data: {
            progress: Math.min(99, Math.floor((doneChapters / totalChapters) * 100)),
          },
        })
      }

      await prisma.p2p_transfer.update({
        where: { p2pTransferId: transfer.p2pTransferId },
        data: { status: 'success', progress: 100, endTime: new Date() },
      })
      console.log(`[p2p-pull] === 任务完成 transferId=${this.transferId} 共 ${totalChapters} 章节 ===`)
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
   * 通过 Tracker 发现拥有该资源的 seeds
   * - chapter / manga 类型按 remoteMangaId 查询(章节级共享回落到漫画级)
   * - media 类型按 remoteMediaId 查询
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

    // 过滤 baseUrl 不可用的 seed
    const seeds: Seed[] = []
    for (const r of raw || []) {
      const baseUrl = pickBaseUrl(r)
      if (!baseUrl) continue
      seeds.push({
        nodeId: r.nodeId,
        nodeName: r.nodeName,
        online: r.online,
        publicHost: r.publicHost,
        publicPort: r.publicPort,
        localHost: r.localHost,
        localPort: r.localPort,
        baseUrl,
      })
    }

    // 在线优先(tracker 已排序但二次保险)
    seeds.sort((a, b) => (b.online ?? 0) - (a.online ?? 0))
    this.seeds = seeds
  }

  /**
   * 选择下一个可用 seed (round-robin),自动跳过失败次数超阈值的节点
   */
  private nextSeed(blacklist: Set<string> = new Set()): Seed | null {
    const total = this.seeds.length
    if (!total) return null

    for (let i = 0; i < total; i++) {
      const seed = this.seeds[(this.cursor + i) % total]
      if (blacklist.has(seed.nodeId)) continue
      const fail = this.failureCounter.get(seed.nodeId) ?? 0
      if (fail >= this.MAX_FAILURE_PER_SEED) continue
      this.cursor = (this.cursor + i + 1) % total
      return seed
    }
    return null
  }

  private markSeedFailure(seed: Seed) {
    const cur = this.failureCounter.get(seed.nodeId) ?? 0
    this.failureCounter.set(seed.nodeId, cur + 1)
  }

  /**
   * 多源请求执行器:用 round-robin 在 seeds 池中尝试,直到成功或所有 seed 失败
   */
  private async withFailover<T>(
    context: string,
    fn: (seed: Seed) => Promise<T>
  ): Promise<T> {
    const triedThisCall = new Set<string>()
    let lastError: any = null

    while (true) {
      const seed = this.nextSeed(triedThisCall)
      if (!seed) break
      triedThisCall.add(seed.nodeId)

      try {
        const result = await fn(seed)
        return result
      } catch (e: any) {
        const msg = format_axios_error(e, `${context} @ ${seed.nodeName || seed.nodeId}`)
        console.warn(`[p2p-pull] ${msg},尝试下一个 seed`)
        this.markSeedFailure(seed)
        lastError = new Error(msg)
      }
    }

    throw lastError || new Error(`${context}: 所有 seed 均失败`)
  }

  /**
   * 展开 manga 拉取为多个章节子任务
   */
  private async expandMangaTasks(
    headers: Headers,
    remoteMangaId: number,
    rootDir: string
  ): Promise<ChapterTask[]> {
    this.ensureDir(rootDir)

    const chapters = await this.withFailover(
      `获取漫画章节列表 (mangaId=${remoteMangaId})`,
      async (seed) => {
        const url = `${seed.baseUrl}/p2p/serve/manga/${remoteMangaId}/chapters`
        const res = await axios.get(url, { headers, timeout: 30 * 1000 })
        return (res.data?.list ?? []) as any[]
      }
    )

    console.log(`[p2p-pull] expandMangaTasks mangaId=${remoteMangaId} 章节数=${chapters.length}`)
    return chapters
      .filter((c) => c?.chapterId)
      .map((c) => ({
        remoteChapterId: Number(c.chapterId),
        saveDir: path.join(rootDir, this.safeName(c.chapterName || `chapter_${c.chapterId}`)),
      }))
  }

  /**
   * 展开 media 拉取
   */
  private async expandMediaTasks(
    headers: Headers,
    remoteMediaId: number,
    rootDir: string
  ): Promise<ChapterTask[]> {
    this.ensureDir(rootDir)

    const mangas = await this.withFailover(
      `获取媒体库漫画列表 (mediaId=${remoteMediaId})`,
      async (seed) => {
        const url = `${seed.baseUrl}/p2p/serve/media/${remoteMediaId}/mangas`
        const res = await axios.get(url, { headers, timeout: 30 * 1000 })
        return (res.data?.list ?? []) as any[]
      }
    )
    console.log(`[p2p-pull] expandMediaTasks mediaId=${remoteMediaId} 漫画数=${mangas.length}`)
    if (!mangas.length) return []

    const allTasks: ChapterTask[] = []
    for (const manga of mangas) {
      if (!manga?.mangaId) continue
      const mangaDir = path.join(rootDir, this.safeName(manga.mangaName || `manga_${manga.mangaId}`))

      const chapters = await this.withFailover(
        `获取漫画章节列表 (mangaId=${manga.mangaId})`,
        async (seed) => {
          const url = `${seed.baseUrl}/p2p/serve/manga/${manga.mangaId}/chapters`
          const res = await axios.get(url, { headers, timeout: 30 * 1000 })
          return (res.data?.list ?? []) as any[]
        }
      )
      for (const c of chapters) {
        if (!c?.chapterId) continue
        allTasks.push({
          remoteChapterId: Number(c.chapterId),
          saveDir: path.join(mangaDir, this.safeName(c.chapterName || `chapter_${c.chapterId}`)),
        })
      }
    }

    return allTasks
  }

  /**
   * 章节级:拉取该章节所有图片到 saveDir
   * - 图片清单:从任意 seed 拉取(默认所有 seed 索引一致)
   * - 单文件下载:在 seeds 之间轮询,失败自动换下一个 seed
   */
  private async pullChapterImages(
    headers: Headers,
    remoteChapterId: number,
    saveDir: string
  ) {
    this.ensureDir(saveDir)

    const images = await this.withFailover(
      `获取章节图片列表 (chapterId=${remoteChapterId})`,
      async (seed) => {
        const url = `${seed.baseUrl}/p2p/serve/chapter/${remoteChapterId}/images`
        const res = await axios.get(url, { headers, timeout: 30 * 1000 })
        return (res.data?.list ?? []) as string[]
      }
    )

    if (!images.length) {
      console.warn(`[p2p-pull] 章节 chapterId=${remoteChapterId} 图片列表为空,跳过`)
      return
    }
    console.log(`[p2p-pull] 章节 chapterId=${remoteChapterId} 共 ${images.length} 张图片`)

    let downloaded = 0
    let skipped = 0
    for (const remoteFile of images) {
      const fileName = path.basename(remoteFile)
      const localPath = path.join(saveDir, fileName)

      if (fs.existsSync(localPath)) {
        skipped++
        continue
      }

      // 每张图片用 round-robin 选一个 seed,失败再换源
      await this.withFailover(
        `下载文件 (file=${remoteFile})`,
        async (seed) => {
          await this.downloadFile(seed.baseUrl, headers, remoteFile, localPath)
        }
      )
      downloaded++
    }
    console.log(
      `[p2p-pull] 章节 chapterId=${remoteChapterId} 完成 ` +
      `下载=${downloaded} 已存在跳过=${skipped} 总数=${images.length}`
    )
  }

  private async downloadFile(
    baseUrl: string,
    headers: Headers,
    remoteFile: string,
    localPath: string
  ) {
    const writer = fs.createWriteStream(localPath)
    const res = await axios({
      method: 'post',
      url: `${baseUrl}/p2p/serve/file`,
      headers: { ...headers, 'Content-Type': 'application/json; charset=UTF-8' },
      data: { file: remoteFile },
      responseType: 'stream',
      timeout: 60 * 1000,
    })

    res.data.pipe(writer)

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', () => resolve())
      writer.on('error', (err) => {
        try {
          fs.unlinkSync(localPath)
        } catch {}
        reject(new Error(`文件写入失败: ${err.message}`))
      })
      // 流错误也要捕获,避免 axios stream 出错时不释放
      res.data.on('error', (err: any) => {
        writer.destroy()
        try {
          fs.unlinkSync(localPath)
        } catch {}
        reject(err)
      })
    })
  }

  private async fail(msg: string) {
    await prisma.p2p_transfer.update({
      where: { p2pTransferId: this.transferId },
      data: { status: 'failed', error: msg, endTime: new Date() },
    })
  }

  private ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private safeName(name: string): string {
    return String(name)
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/^\.+/, '_')
      .trim()
      .slice(0, 200) || 'unnamed'
  }
}