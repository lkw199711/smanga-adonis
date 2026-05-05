/**
 * P2P 拉取任务
 *
 * 支持三种 transferType:
 *  - chapter: 拉取单个章节的所有图片到 receivedPath/
 *  - manga:   拉取整本漫画(下属所有章节),结构 receivedPath/<chapterName>/<files>
 *  - media:   拉取整个媒体库(下属所有漫画的所有章节),结构 receivedPath/<mangaName>/<chapterName>/<files>
 *
 * 流程:
 *  1. 读取 p2p_transfer 记录,校验状态
 *  2. 查询 p2p_peer_cache 获取对端地址(优先 publicHost:publicPort,其次 localHost:localPort)
 *  3. 对应类型拆分为多个章节级下载子任务
 *  4. 依次调用 /p2p/serve/chapter/:id/images 拿文件清单,/p2p/serve/file 流式下载
 *  5. 实时更新 p2p_transfer.progress / status
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

export default class P2PPullJob {
  private transferId: number

  constructor(args: P2PPullArgs) {
    this.transferId = args.transferId
  }

  async run() {
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

    const identity = p2pIdentityService.getIdentity()
    if (!identity) {
      await this.fail('本节点未完成身份注册')
      return
    }

    const group = await prisma.p2p_group.findUnique({
      where: { p2pGroupId: transfer.p2pGroupId },
    })
    if (!group) {
      await this.fail('群组不存在')
      return
    }

    const peer = await prisma.p2p_peer_cache.findFirst({
      where: { p2pGroupId: transfer.p2pGroupId, nodeId: transfer.peerNodeId },
    })
    if (!peer) {
      await this.fail('对端节点信息缺失,请先刷新成员列表')
      return
    }

    const baseUrl = this.pickPeerBaseUrl(peer)
    if (!baseUrl) {
      await this.fail('对端地址不可达(无公网也无局域网)')
      return
    }

    const headers: Headers = {
      'X-Node-Id': identity.nodeId,
      'X-Group-No': group.groupNo,
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
        throw new Error('对端无可下载章节')
      }

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

        await this.pullChapterImages(baseUrl, headers, task.remoteChapterId, task.saveDir)
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
    } catch (e: any) {
      console.error('[p2p-pull] 失败', e?.message)
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

    const res = await axios.get(`${baseUrl}/p2p/serve/manga/${remoteMangaId}/chapters`, {
      headers,
      timeout: 30 * 1000,
    })
    const chapters: any[] = res.data?.list ?? []
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

    const mangasRes = await axios.get(`${baseUrl}/p2p/serve/media/${remoteMediaId}/mangas`, {
      headers,
      timeout: 30 * 1000,
    })
    const mangas: any[] = mangasRes.data?.list ?? []
    if (!mangas.length) return []

    const allTasks: ChapterTask[] = []
    for (const manga of mangas) {
      if (!manga?.mangaId) continue
      const mangaDir = path.join(rootDir, this.safeName(manga.mangaName || `manga_${manga.mangaId}`))

      const chRes = await axios.get(`${baseUrl}/p2p/serve/manga/${manga.mangaId}/chapters`, {
        headers,
        timeout: 30 * 1000,
      })
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

    const listRes = await axios.get(`${baseUrl}/p2p/serve/chapter/${remoteChapterId}/images`, {
      headers,
      timeout: 30 * 1000,
    })
    const images: string[] = listRes.data?.list ?? []
    if (!images.length) {
      // 章节为空也视为下载成功(继续下一章节),不抛错
      return
    }

    for (const remoteFile of images) {
      const fileName = path.basename(remoteFile)
      const localPath = path.join(saveDir, fileName)

      if (fs.existsSync(localPath)) continue

      await this.downloadFile(baseUrl, headers, remoteFile, localPath)
    }
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

  private pickPeerBaseUrl(peer: any): string | null {
    if (peer.publicHost && peer.publicPort) {
      return `http://${peer.publicHost}:${peer.publicPort}`
    }
    if (peer.publicHost) {
      // 假设对端主服务端口与本节点同
      return `http://${peer.publicHost}:${process.env.PORT || 3000}`
    }
    if (peer.localHost && peer.localPort) {
      return `http://${peer.localHost}:${peer.localPort}`
    }
    return null
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