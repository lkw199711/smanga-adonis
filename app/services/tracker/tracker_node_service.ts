import prisma from '#start/prisma'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { get_config } from '#utils/index'
import type {
  NodeRegisterPayload,
  NodeRegisterResult,
  HeartbeatPayload,
  HeartbeatResult,
} from '#type/p2p'

/**
 * Tracker 节点服务
 * 负责节点的注册/心跳/查询/注销等生命周期管理
 */
class TrackerNodeService {
  /**
   * 节点注册
   */
  async register(
    payload: NodeRegisterPayload,
    remoteIp: string,
    userAgent?: string
  ): Promise<NodeRegisterResult> {
    const tc = get_config()?.p2p?.tracker || {}

    // 邀请码校验(若启用)
    if (tc.requireInviteToRegister) {
      if (!payload.inviteCode) {
        throw new Error('需要邀请码才能注册')
      }
      const invite = await prisma.tracker_invite.findUnique({
        where: { code: payload.inviteCode },
      })
      if (!invite) throw new Error('邀请码无效')
      if (invite.usedTime) throw new Error('邀请码已使用')
      if (invite.expires && new Date(invite.expires) < new Date()) {
        throw new Error('邀请码已过期')
      }
    } else if (!tc.allowPublicRegister) {
      throw new Error('Tracker 未开放公开注册')
    }

    // 节点数量上限
    const nodeCount = await prisma.tracker_node.count()
    if (tc.maxNodes && nodeCount >= tc.maxNodes) {
      throw new Error('Tracker 节点数量已达上限')
    }

    // 生成唯一 ID 与明文 token(只此一次返回)
    const nodeId = uuidv4()
    const rawToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    // publicHost / publicPort:
    //   - publicHost 优先取节点自报(部署在公网/反向代理后,节点自己更清楚域名),否则用 request.ip()
    //   - publicPort 必须由节点自报(tracker 无法从 HTTP 连接推导出节点的对外端口)
    const publicHost = payload.publicHost || remoteIp
    const publicPort = payload.publicPort || null

    await prisma.tracker_node.create({
      data: {
        nodeId,
        nodeToken: tokenHash,
        nodeName: payload.nodeName || null,
        publicHost,
        publicPort,
        localHost: payload.localHost || null,
        localPort: payload.localPort || null,
        version: payload.version || null,
        userAgent: userAgent || null,
        online: 1,
        lastHeartbeat: new Date(),
      },
    })

    return {
      nodeId,
      nodeToken: rawToken,
      publicHost,
    }
  }

  /**
   * 心跳(同时更新 publicHost/localHost)
   */
  async heartbeat(
    nodeId: string,
    payload: HeartbeatPayload,
    remoteIp: string
  ): Promise<HeartbeatResult> {
    // 心跳时同步刷新 publicHost/publicPort/localHost/localPort
    // - publicHost: 节点自报优先,否则用请求来源 IP
    // - publicPort: 仅节点自报(undefined 时不更新原值)
    const publicHost = payload.publicHost || remoteIp
    await prisma.tracker_node.update({
      where: { nodeId },
      data: {
        online: 1,
        lastHeartbeat: new Date(),
        publicHost,
        ...(payload.publicPort !== undefined && { publicPort: payload.publicPort }),
        ...(payload.localHost !== undefined && { localHost: payload.localHost }),
        ...(payload.localPort !== undefined && { localPort: payload.localPort }),
      },
    })

    return {
      publicHost,
      serverTime: Date.now(),
      pendingNotifications: [],
    }
  }

  /**
   * 更新节点信息
   */
  async update(nodeId: string, data: { nodeName?: string }) {
    return prisma.tracker_node.update({
      where: { nodeId },
      data: {
        ...(data.nodeName !== undefined && { nodeName: data.nodeName }),
      },
    })
  }

  /**
   * 注销节点(级联清理群组成员/索引,群组若该节点是 owner 则同时停用)
   */
  async deregister(nodeId: string) {
    // 删除成员关系
    await prisma.tracker_membership.deleteMany({ where: { nodeId } })
    // 删除共享索引
    await prisma.tracker_share_index.deleteMany({ where: { nodeId } })
    // 停用其拥有的群组(避免孤儿群)
    await prisma.tracker_group.updateMany({
      where: { ownerNodeId: nodeId },
      data: { enable: 0 },
    })
    // 删除节点本身
    await prisma.tracker_node.delete({ where: { nodeId } })
  }

  /**
   * 定期扫描超时未心跳的节点,标记离线
   */
  async markOfflineNodes() {
    const threshold = get_config()?.p2p?.tracker?.offlineThresholdSec ?? 90
    const cutoff = new Date(Date.now() - threshold * 1000)

    const res = await prisma.tracker_node.updateMany({
      where: {
        online: 1,
        lastHeartbeat: { lt: cutoff },
      },
      data: { online: 0 },
    })
    return res.count
  }
}

export default new TrackerNodeService()