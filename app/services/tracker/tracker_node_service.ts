import prisma from '#start/prisma'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { get_config } from '#utils/index'
import { is_reportable_public_host, type ResolveIpResult } from '#utils/ip_resolver'
import trackerReachabilityService from './tracker_reachability_service.js'
import type {
  NodeRegisterPayload,
  NodeRegisterResult,
  HeartbeatPayload,
  HeartbeatResult,
} from '#type/p2p'

/**
 * publicHost 决策(tracker 侧):
 *
 * 节点自报 vs 服务器侧识别,取舍优先级:
 *  1. 节点自报且通过 is_reportable_public_host 校验 -> 直接采用(支持反向代理/域名场景)
 *  2. 否则采用 tracker 解析到的客户端真实 IP(resolve_client_ip 结果)
 *     - 仅接受 public 类别;private/loopback 视为无公网可达端点
 *  3. 都拿不到则返回 null
 */
function decide_public_host(
  reported: string | undefined | null,
  clientIp: ResolveIpResult
): string | null {
  if (is_reportable_public_host(reported)) return String(reported).trim()
  if (clientIp.ip && clientIp.category === 'public') return clientIp.ip
  return null
}

/**
 * Tracker 节点服务
 * 负责节点的注册/心跳/查询/注销等生命周期管理
 */
class TrackerNodeService {
  /**
   * 节点注册
   *
   * 强制公网可达验证:
   *  - 必须提供可用的 publicHost + publicPort (自报或 tracker 识别)
   *  - tracker 主动反向 GET peer /p2p/verify/echo,challenge 校验通过才允许入库
   *  - 本机自连(clientIp=loopback)豁免验证,但同样不写入 publicHost(仅本地调试用)
   *  - 本项目不支持内网/NAT 节点,验证失败直接抛错
   */
  async register(
    payload: NodeRegisterPayload,
    clientIp: ResolveIpResult,
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

    // publicHost / publicPort 决策
    const publicHost = decide_public_host(payload.publicHost, clientIp)
    const publicPort = payload.publicPort || null
    const isLoopback = clientIp.category === 'loopback'

    // 非本机场景:必须同时具备 publicHost + publicPort,且能反向可达
    if (!isLoopback) {
      if (!publicHost) {
        throw new Error(
          '无法确定节点的公网地址。请确认:\n' +
          '  1. 本机具有公网 IP 或配置了反向代理域名(p2p.node.publicHost)\n' +
          '  2. 若在 NAT 后,请做好端口映射并填写真实公网 IP\n' +
          '  本项目不支持纯内网/CGNAT 节点接入'
        )
      }
      if (!publicPort) {
        throw new Error('缺少 publicPort。请在节点配置 p2p.node.publicPort 为对外可访问端口')
      }

      const check = await trackerReachabilityService.verify({ host: publicHost, port: publicPort })
      if (!check.ok) {
        console.warn(
          `[tracker] 注册反向验证失败 host=${publicHost}:${publicPort} reason=${check.reason}`
        )
        throw new Error(
          `节点公网可达性验证失败: ${check.reason}\n` +
          `tracker 无法从 ${publicHost}:${publicPort} 拿到正确 challenge 回包。\n` +
          '请确认:\n' +
          '  - 节点服务正常运行且监听端口正确\n' +
          '  - 防火墙/安全组已放行该端口\n' +
          '  - NAT 后做好端口映射\n' +
          '  - publicHost 可从 tracker 所在网络正常访问'
        )
      }
      console.log(
        `[tracker] 注册反向验证通过 host=${publicHost}:${publicPort} elapsed=${check.elapsedMs}ms`
      )
    } else {
      console.log(`[tracker] 检测到本机自连(loopback),跳过反向验证`)
    }

    // 生成唯一 ID 与明文 token(只此一次返回)
    const nodeId = uuidv4()
    const rawToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    await prisma.tracker_node.create({
      data: {
        nodeId,
        nodeToken: tokenHash,
        nodeName: payload.nodeName || null,
        // 本机自连情况下不入公网 host,避免污染 seeds 列表
        publicHost: isLoopback ? null : publicHost,
        publicPort: isLoopback ? null : publicPort,
        localHost: payload.localHost || null,
        localPort: payload.localPort || null,
        version: payload.version || null,
        userAgent: userAgent || null,
        online: 1,
        lastHeartbeat: new Date(),
      },
    })

    console.log(
      `[tracker] 节点注册成功 nodeId=${nodeId} ` +
      `publicHost=${isLoopback ? 'null(loopback)' : publicHost} publicPort=${isLoopback ? 'null' : publicPort} ` +
      `ipSource=${clientIp.source} ipCategory=${clientIp.category}`
    )

    return {
      nodeId,
      nodeToken: rawToken,
      publicHost: isLoopback ? '' : (publicHost || ''),
    }
  }

  /**
   * 心跳
   *
   * 反向验证策略(分轻重):
   *  - 端点没变化(publicHost/publicPort 与数据库一致)→ 不重复探测,仅刷新 lastHeartbeat
   *  - 端点变化 / 之前 online=0 → 再做一次反向验证:
   *      - 通过:更新端点并 online=1
   *      - 失败:保持 online=0 并记录原因(不抛错,允许节点继续跑并在后续心跳重试)
   *  - loopback:豁免
   */
  async heartbeat(
    nodeId: string,
    payload: HeartbeatPayload,
    clientIp: ResolveIpResult
  ): Promise<HeartbeatResult> {
    const existing = await prisma.tracker_node.findUnique({ where: { nodeId } })
    if (!existing) {
      throw new Error('节点不存在')
    }

    const publicHost = decide_public_host(payload.publicHost, clientIp)
    const publicPort = payload.publicPort ?? existing.publicPort ?? null
    const isLoopback = clientIp.category === 'loopback'

    // 端点是否变化
    const endpointChanged =
      (publicHost !== null && publicHost !== existing.publicHost) ||
      (payload.publicPort !== undefined && payload.publicPort !== existing.publicPort)
    const wasOffline = existing.online !== 1

    let online = 1
    let verifyReason: string | undefined

    if (!isLoopback) {
      // 触发验证的条件:端点变化 或 之前不在线(需要重新探测)
      if (!publicHost || !publicPort) {
        online = 0
        verifyReason = '缺少 publicHost/publicPort'
      } else if (endpointChanged || wasOffline) {
        const check = await trackerReachabilityService.verify({
          host: publicHost,
          port: publicPort,
          expectNodeId: nodeId,
        })
        if (check.ok) {
          online = 1
          console.log(
            `[tracker] 心跳反向验证通过 nodeId=${nodeId} host=${publicHost}:${publicPort} ` +
            `elapsed=${check.elapsedMs}ms (${endpointChanged ? '端点变更' : '离线恢复'})`
          )
        } else {
          online = 0
          verifyReason = check.reason
          console.warn(
            `[tracker] 心跳反向验证失败 nodeId=${nodeId} host=${publicHost}:${publicPort} reason=${check.reason}`
          )
        }
      }
      // 端点未变化且本来 online=1:沿用原 online 值,不耗费 HTTP
    }

    await prisma.tracker_node.update({
      where: { nodeId },
      data: {
        online,
        lastHeartbeat: new Date(),
        ...(publicHost !== null && { publicHost: isLoopback ? null : publicHost }),
        ...(payload.publicPort !== undefined && { publicPort: isLoopback ? null : payload.publicPort }),
        ...(payload.localHost !== undefined && { localHost: payload.localHost }),
        ...(payload.localPort !== undefined && { localPort: payload.localPort }),
      },
    })

    return {
      publicHost: isLoopback ? '' : (publicHost || existing.publicHost || ''),
      serverTime: Date.now(),
      pendingNotifications: online === 0 && verifyReason
        ? [{ type: 'reachability_failed', data: { reason: verifyReason } }]
        : [],
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