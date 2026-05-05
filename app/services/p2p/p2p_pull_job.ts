/**
 * P2P 拉取任务(章节级 MVP)
 *
 * 从群内对等节点拉取指定章节的所有图片文件到本地 receivedPath。
 *
 * 流程:
 *  1. 读取 p2p_transfer 记录(必须 status != canceled)
 *  2. 查询 p2p_peer_cache 获取对端地址(优先公网 publicHost:publicPort,其次 lan)
 *  3. 通过 /p2p/serve/chapter/:id/images 拿文件名列表
 *  4. 用 /p2p/serve/file 流式下载每个文件
 *  5. 更新 p2p_transfer.progress/status
 *
 * 复用已有 axios 下载工具,携带握手头 X-Node-Id / X-Group-No / X-Timestamp。
 */

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import prisma from '#start/prisma'
import p2pIdentityService from './p2p_identity_service.js'

type P2PPullArgs = {
  transferId: number
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

    const headers = {
      'X-Node-Id': identity.nodeId,
      'X-Group-No': group.groupNo,
      'X-Timestamp': String(Date.now()),
    }

    await prisma.p2p_transfer.update({
      where: { p2pTransferId: transfer.p2pTransferId },
      data: { status: 'running', startTime: new Date() },
    })

    try {
      if (transfer.transferType === 'chapter' && transfer.remoteChapterId) {
        await this.pullChapter(baseUrl, headers, transfer.remoteChapterId, transfer.receivedPath)
      } else {
        throw new Error(`暂不支持的 transferType: ${transfer.transferType}`)
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
   * 章节级拉取:
   *  - 确保 receivedPath 存在
   *  - 获取图片清单
   *  - 依次下载
   */
  private async pullChapter(
    baseUrl: string,
    headers: Record<string, string>,
    remoteChapterId: number,
    receivedPath: string
  ) {
    if (!fs.existsSync(receivedPath)) {
      fs.mkdirSync(receivedPath, { recursive: true })
    }

    const listRes = await axios.get(`${baseUrl}/p2p/serve/chapter/${remoteChapterId}/images`, {
      headers,
      timeout: 30 * 1000,
    })
    const images: string[] = listRes.data?.list ?? []

    if (!images.length) {
      throw new Error('对端章节无文件')
    }

    let done = 0
    for (const remoteFile of images) {
      const fileName = path.basename(remoteFile)
      const localPath = path.join(receivedPath, fileName)

      if (fs.existsSync(localPath)) {
        done++
        continue
      }

      await this.downloadFile(baseUrl, headers, remoteFile, localPath)
      done++

      // 更新进度
      await prisma.p2p_transfer.update({
        where: { p2pTransferId: this.transferId },
        data: { progress: Math.min(99, Math.floor((done / images.length) * 100)) },
      })
    }
  }

  private async downloadFile(
    baseUrl: string,
    headers: Record<string, string>,
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
        try { fs.unlinkSync(localPath) } catch { }
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
}