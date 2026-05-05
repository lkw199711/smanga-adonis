/**
 * P2P 身份管理服务
 *
 * 职责:
 *  - 保证本节点拥有 nodeId / nodeToken(若无则自动向首选 Tracker 注册)
 *  - 注册成功后将 nodeId/nodeToken/nodeName 写回 smanga.json
 *  - 提供给其他服务统一的身份读取入口
 *
 * 注意:
 *  - nodeToken 仅首次注册由 Tracker 明文返回,之后仅持久化在本地配置;
 *    Tracker 侧只存 sha256(token),无法恢复。
 *  - 如果本机 role.tracker == true 且 trackers 为空/指向自身,则走 "本地直注册" 分支,
 *    直接写入 tracker_node 表,避免 HTTP 自调(此时后端可能尚未就绪)。
 */

import os from 'os'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { get_config, set_config } from '#utils/index'
import prisma from '#start/prisma'
import TrackerClient from './tracker_client.js'

export type P2PIdentity = {
  nodeId: string
  nodeToken: string
  nodeName: string
}

class P2PIdentityService {
  /**
   * 获取身份;如缺失则自动注册(本机 tracker 走本地直注册,否则走 HTTP)
   */
  async ensureIdentity(): Promise<P2PIdentity | null> {
    const config = get_config()
    const p2p = config?.p2p
    if (!p2p?.enable || !p2p?.role?.node) return null

    // 已存在且完整
    if (p2p.node?.nodeId && p2p.node?.nodeToken) {
      return {
        nodeId: p2p.node.nodeId,
        nodeToken: p2p.node.nodeToken,
        nodeName: p2p.node.nodeName || '',
      }
    }

    const nodeName = p2p.node?.nodeName || os.hostname() || 'smanga-node'

    // 1) 本机即 tracker 时,直接本地落库,不依赖 HTTP
    if (this.isLocalTracker(p2p)) {
      try {
        const identity = await this.registerLocally(nodeName, p2p)
        console.log(`[p2p] 本机 tracker,已本地直注册 nodeId=${identity.nodeId}`)
        return identity
      } catch (e: any) {
        console.error('[p2p] 本地直注册失败:', e?.message || e)
        return null
      }
    }

    // 2) 远端 tracker,走 HTTP 注册
    const trackerUrl = this.pickTrackerUrl(p2p)
    if (!trackerUrl) {
      console.warn('[p2p] 未配置 trackers,跳过自动注册')
      return null
    }

    const client = new TrackerClient(trackerUrl)
    try {
      const res = await client.register({
        nodeName,
        version: 'smanga-adonis',
        localHost: p2p.node?.lanHost || undefined,
        localPort: p2p.node?.lanPort || p2p.node?.listenPort || undefined,
      })

      // 回写配置
      config.p2p.node.nodeId = res.nodeId
      config.p2p.node.nodeToken = res.nodeToken
      config.p2p.node.nodeName = nodeName
      if (res.publicHost) {
        config.p2p.node.publicHost = res.publicHost
      }
      set_config(config)

      console.log(`[p2p] 节点自动注册成功 nodeId=${res.nodeId} publicHost=${res.publicHost}`)
      return {
        nodeId: res.nodeId,
        nodeToken: res.nodeToken,
        nodeName,
      }
    } catch (e: any) {
      console.error('[p2p] 节点自动注册失败 url=%s', trackerUrl)
      console.error('[p2p] -> message :', e?.message)
      console.error('[p2p] -> code    :', e?.code)
      console.error('[p2p] -> status  :', e?.response?.status)
      console.error('[p2p] -> data    :', e?.response?.data)
      if (!e?.response) {
        console.error('[p2p] -> stack   :', e?.stack)
      }
      return null
    }
  }

  /**
   * 读取当前身份(不触发注册)
   */
  getIdentity(): P2PIdentity | null {
    const p2p = get_config()?.p2p
    if (!p2p?.node?.nodeId || !p2p?.node?.nodeToken) return null
    return {
      nodeId: p2p.node.nodeId,
      nodeToken: p2p.node.nodeToken,
      nodeName: p2p.node.nodeName || '',
    }
  }

  /**
   * 判定当前配置下 tracker 是否就是本机:
   *  - role.tracker 必须为 true
   *  - 满足以下任一:
   *      a) node.trackers 为空
   *      b) node.trackers[0] host 指向 localhost / 127.0.0.1 / ::1
   *      c) node.trackers[0] 与 tracker.publicUrl 完全一致
   */
  private isLocalTracker(p2p: any): boolean {
    if (!p2p?.role?.tracker) return false

    const trackers: string[] = p2p?.node?.trackers || []
    if (trackers.length === 0) return true

    const first = trackers[0]
    const publicUrl: string = p2p?.tracker?.publicUrl || ''
    if (publicUrl && first.replace(/\/+$/, '') === publicUrl.replace(/\/+$/, '')) {
      return true
    }

    try {
      const u = new URL(first)
      const host = u.hostname
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
        return true
      }
    } catch {
      // 非法 URL 忽略
    }

    return false
  }

  /**
   * 本地直注册:自行生成 nodeId/rawToken,写入 tracker_node 表,并回写 smanga.json
   * 用于 "本机既是 node 又是 tracker" 的一体机场景,避免 HTTP 自调
   */
  private async registerLocally(nodeName: string, p2p: any): Promise<P2PIdentity> {
    const nodeId = uuidv4()
    const rawToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    await prisma.tracker_node.create({
      data: {
        nodeId,
        nodeToken: tokenHash,
        nodeName: nodeName || null,
        publicHost: '127.0.0.1',
        localHost: p2p?.node?.lanHost || '127.0.0.1',
        localPort: p2p?.node?.lanPort || p2p?.node?.listenPort || null,
        version: 'smanga-adonis',
        userAgent: 'local-init',
        online: 1,
        lastHeartbeat: new Date(),
      },
    })

    // 回写配置
    const config = get_config()
    config.p2p.node.nodeId = nodeId
    config.p2p.node.nodeToken = rawToken
    config.p2p.node.nodeName = nodeName
    if (!config.p2p.node.publicHost) {
      config.p2p.node.publicHost = '127.0.0.1'
    }
    set_config(config)

    return { nodeId, nodeToken: rawToken, nodeName }
  }

  /**
   * 选择 tracker url:
   *  1. 节点配置的 trackers[0]
   *  2. 若自身是 tracker 角色,且 publicUrl 非空则使用
   *  3. 若自身是 tracker 且均为空,则尝试 http://127.0.0.1:{主服务端口}
   */
  pickTrackerUrl(p2p: any): string | null {
    const trackers: string[] = p2p?.node?.trackers || []
    if (trackers.length > 0) return trackers[0]

    if (p2p?.role?.tracker) {
      const publicUrl = p2p?.tracker?.publicUrl
      if (publicUrl) return publicUrl
      // 回落到本地主服务(AdonisJS 默认端口,通过 .env PORT 获取)
      const port = process.env.PORT || 3000
      return `http://127.0.0.1:${port}`
    }

    return null
  }
}

export default new P2PIdentityService()