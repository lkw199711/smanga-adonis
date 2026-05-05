/**
 * P2P 拉取任务
 *
 * 支持三种 transferType:
 *  - chapter: 拉取单个章节的所有图片到 receivedPath/
 *  - manga:   拉取整本漫画(下属所有章节),结构 receivedPath/<chapterName>/<files>
 *  - media:   拉取整个媒体库(下属所有漫画的所有章节),结构 receivedPath/<mangaName>/<chapterName>/<files>
 *
 * 设计:
 *  - 共享/群组授权由 Tracker 统一管理,本任务不做本地鉴权
 *  - 目标地址 peerBaseUrl 与 groupNo 已由上游(控制器)写入 p2p_transfer,本任务直接读取
 *  - 仅依赖本地 p2p_identity(X-Node-Id / X-Node-Token)作为对端握手凭证
 *
 * 流程:
 *  1. 读取 p2p_transfer 记录(peerBaseUrl / groupNo / peerNodeId ...)
 *  2. 按 transferType 展开为章节级子任务
 *  3. 依次调用 /p2p/serve/chapter/:id/images 拿文件清单,/p2p/serve/file 流式下载
 *  4. 实时更新 p2p_transfer.progress / status
 *
 * 注意:
 *  - 文件名安全化(去除路径分隔符)避免越权写入
 *  - 进度按"已完成章节数 / 总章节数"计算
 */

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import prisma from '#start/prisma'
import p2pIdentityService from './p2p_identity_service.js'

type P2PPullArgs = {
  transferId: number
}

type Headers = Record<string, string>

type ChapterTask = {
  remoteChapterId: number
  saveDir: string // 该章节下载到的本地目录
}

/**
 * 从 axios 错误中提取详细信息,生成可读性强的错误描述
 * 包含: HTTP 状态码、远端 message、URL、网络层错误码
 */
function format_axios_error(err: any, context: string): string {
  const url = err?.config?.url || '(unknown url)'
  const method = (err?.config?.method || 'get').toUpperCase()
  const status = err?.response?.status
  const remoteMsg = err?.response?.data?.message
  const remoteData = err?.response?.data
  const code = err?.code // ECONNREFUSED / ETIMEDOUT / ENOTFOUND ...

  // 网络层错误(无 HTTP 响应)
  if (!status) {
    if (code === 'ECONNREFUSED') return `${context}: 对端拒绝连接 (${method} ${url}) - 请检查对端服务是否在线、端口是否开放`
    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') return `${context}: 请求超时 (${method} ${url}) - 请检查网络可达性与防火墙`
    if (code === 'ENOTFOUND') return `${context}: 域名解析失败 (${method} ${url}) - 请检查 peerBaseUrl 配置`
    return `${context}: 网络错误 ${code || ''} (${method} ${url}) - ${err?.message}`
  }

  // 有 HTTP 响应,根据状态码细化提示
  let hint = ''
  if (status === 401) hint = ' (握手信息缺失或时间戳过期)'
  else if (status === 403) hint = ' (对端 Tracker 鉴权拒绝:未授权访问该资源)'
  else if (status === 404) hint = ' (资源不存在)'
  else if (status === 503) hint = ' (对端 P2P 服务未启用)'

  const dataStr = remoteData && typeof remoteData === 'object' ? JSON.stringify(remoteData) : ''
  return `${context}: HTTP ${status}${hint} (${method} ${url}) - ${remoteMsg || err?.message}${dataStr ? ' | data=' + dataStr : ''}`
}

export default class P2PPullJob {
  private transferId: number

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
      `peerNodeId=${transfer.peerNodeId} ` +
      `peerBaseUrl=${transfer.peerBaseUrl} ` +
      `groupNo=${transfer.groupNo} ` +
      `remoteName=${transfer.remoteName} ` +
      `receivedPath=${transfer.receivedPath}`
    )

    // 身份凭证是对端握手必需字段,读取失败则无法构造有效请求
    const identity = p2pIdentityService.getIdentity()
    if (!identity) {
      await this.fail('本节点未完成身份注册 (请检查 smanga.json 中 p2p.node.nodeId/nodeToken 是否已生成)')
      return
    }
    console.log(`[p2p-pull] 本节点身份 nodeId=${identity.nodeId} nodeName=${identity.nodeName}`)

    // 直接从 transfer 记录取 groupNo 与 peerBaseUrl,不再查本地 p2p_group / p2p_peer_cache
    const groupNo = transfer.groupNo
    const baseUrl = (transfer.peerBaseUrl || '').replace(/\/+$/, '')
    if (!groupNo) {
      await this.fail('transfer.groupNo 缺失 (创建时未传入)')
      return
    }
    if (!baseUrl) {
      await this.fail('transfer.peerBaseUrl 缺失 (创建时未传入)')
      return
    }

    const headers: Headers = {
      'X-Node-Id': identity.nodeId,
      'X-Group-No': groupNo,
      'X-Timestamp': String(Date.now()),
    }

    await prisma.p2p_transfer.update({
      where: { p2pTransferId: transfer.p2pTransferId },
      data: { status: 'running', startTime: new Date() },
    })

    try {
      // 收集所有章节级子任务
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
        chapterTasks = await this.expandMangaTasks(
          baseUrl,
          headers,
          transfer.remoteMangaId,
          transfer.receivedPath
        )
      } else if (transfer.transferType === 'media') {
        if (!transfer.remoteMediaId) throw new Error('remoteMediaId 缺失')
        chapterTasks = await this.expandMediaTasks(
          baseUrl,
          headers,
          transfer.remoteMediaId,
          transfer.receivedPath
        )
      } else {
        throw new Error(`暂不支持的 transferType: ${transfer.transferType}`)
      }

      if (!chapterTasks.length) {
        throw new Error('对端无可下载章节 (列表为空)')
      }
      console.log(`[p2p-pull] 共 ${chapterTasks.length} 个章节待下载`)

      // 依次执行章节下载,以章节为粒度刷新进度
      let doneChapters = 0
      const totalChapters = chapterTasks.length
      for (const task of chapterTasks) {
        // 检查是否被取消
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
          await this.pullChapterImages(baseUrl, headers, task.remoteChapterId, task.saveDir)
        } catch (chErr: any) {
          // 包装单章节错误,带上章节上下文继续抛出(整个任务失败)
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
      // 详细打印 axios 错误结构,方便定位问题
      const detail = {
        message: e?.message,
        code: e?.code,
        url: e?.config?.url,
        method: e?.config?.method,
        httpStatus: e?.response?.status,
        remoteMessage: e?.response?.data?.message,
        remoteData: e?.response?.data,
      }
      console.error(`[p2p-pull] === 任务失败 transferId=${this.transferId} ===`, detail)
      if (process.env.P2P_DEBUG) {
        console.error('[p2p-pull] stack:', e?.stack)
      }
      await this.fail(e?.message || String(e))
    }
  }

  /**
   * 展开 manga 拉取为多个章节子任务,并按章节名建立子目录
   */
  private async expandMangaTasks(
    baseUrl: string,
    headers: Headers,
    remoteMangaId: number,
    rootDir: string
  ): Promise<ChapterTask[]> {
    this.ensureDir(rootDir)

    const url = `${baseUrl}/p2p/serve/manga/${remoteMangaId}/chapters`
    let res
    try {
      res = await axios.get(url, { headers, timeout: 30 * 1000 })
    } catch (e: any) {
      throw new Error(format_axios_error(e, `获取漫画章节列表 (mangaId=${remoteMangaId})`))
    }
    const chapters: any[] = res.data?.list ?? []
    console.log(`[p2p-pull] expandMangaTasks mangaId=${remoteMangaId} 章节数=${chapters.length}`)
    if (!chapters.length) return []

    return chapters
      .filter((c) => c?.chapterId)
      .map((c) => ({
        remoteChapterId: Number(c.chapterId),
        saveDir: path.join(rootDir, this.safeName(c.chapterName || `chapter_${c.chapterId}`)),
      }))
  }

  /**
   * 展开 media 拉取为多漫画 × 多章节,二级目录: rootDir/<mangaName>/<chapterName>/
   */
  private async expandMediaTasks(
    baseUrl: string,
    headers: Headers,
    remoteMediaId: number,
    rootDir: string
  ): Promise<ChapterTask[]> {
    this.ensureDir(rootDir)

    const mangaListUrl = `${baseUrl}/p2p/serve/media/${remoteMediaId}/mangas`
    let mangasRes
    try {
      mangasRes = await axios.get(mangaListUrl, { headers, timeout: 30 * 1000 })
    } catch (e: any) {
      throw new Error(format_axios_error(e, `获取媒体库漫画列表 (mediaId=${remoteMediaId})`))
    }
    const mangas: any[] = mangasRes.data?.list ?? []
    console.log(`[p2p-pull] expandMediaTasks mediaId=${remoteMediaId} 漫画数=${mangas.length}`)
    if (!mangas.length) return []

    const allTasks: ChapterTask[] = []
    for (const manga of mangas) {
      if (!manga?.mangaId) continue
      const mangaDir = path.join(rootDir, this.safeName(manga.mangaName || `manga_${manga.mangaId}`))

      const chUrl = `${baseUrl}/p2p/serve/manga/${manga.mangaId}/chapters`
      let chRes
      try {
        chRes = await axios.get(chUrl, { headers, timeout: 30 * 1000 })
      } catch (e: any) {
        throw new Error(format_axios_error(e, `获取漫画章节列表 (mangaId=${manga.mangaId})`))
      }
      const chapters: any[] = chRes.data?.list ?? []
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
   */
  private async pullChapterImages(
    baseUrl: string,
    headers: Headers,
    remoteChapterId: number,
    saveDir: string
  ) {
    this.ensureDir(saveDir)

    const listUrl = `${baseUrl}/p2p/serve/chapter/${remoteChapterId}/images`
    let listRes
    try {
      listRes = await axios.get(listUrl, { headers, timeout: 30 * 1000 })
    } catch (e: any) {
      throw new Error(format_axios_error(e, `获取章节图片列表 (chapterId=${remoteChapterId})`))
    }
    const images: string[] = listRes.data?.list ?? []
    if (!images.length) {
      console.warn(`[p2p-pull] 章节 chapterId=${remoteChapterId} 图片列表为空,跳过`)
      // 章节为空也视为下载成功(继续下一章节),不抛错
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

      try {
        await this.downloadFile(baseUrl, headers, remoteFile, localPath)
        downloaded++
      } catch (e: any) {
        throw new Error(format_axios_error(e, `下载文件 (file=${remoteFile})`))
      }
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

  /**
   * 文件名安全化:去除路径分隔符与 windows 非法字符,防止越权写入与系统拒写
   */
  private safeName(name: string): string {
    return String(name)
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/^\.+/, '_')
      .trim()
      .slice(0, 200) || 'unnamed'
  }
}