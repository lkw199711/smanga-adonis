import prisma from '#start/prisma'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { get_config } from '#utils/index'
import {
  is_reportable_public_url,
  normalize_public_url,
  type ResolveIpResult,
} from '#utils/ip_resolver'
import trackerReachabilityService from './tracker_reachability_service.js'
import type {
  NodeRegisterPayload,
  NodeRegisterResult,
  HeartbeatPayload,
  HeartbeatResult,
} from '#type/p2p'

/**
 * publicUrl 决策(tracker 侧 - 简化版):
 *
 *  - 完全信任节点自报的 publicUrl,只做 normalize_public_url(补 http://、去尾斜杠)
 *  - host 必须非 loopback / 0.0.0.0 / localhost,否则视为不可入库
 *  - 不再用 request.ip() 推断、不再做 host:port 拼接、不再自动套 /api 反代路径
 *
 *  → 注册和心跳的"反向可达验证"用的是同一个 URL,数据库里存的也是这个 URL,语义彻底对齐
 *
 * 返回 null 表示节点没有提供可用的 publicUrl(本机自连场景由调用方按 loopback 处理)
 */
function decide_public_url(reported: string | undefined | null): string | null {
  if (!is_reportable_public_url(reported)) return null
  const url = normalize_public_url(reported)
  return url || null
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
   *  - 节点必须自报合法 publicUrl(host 非 loopback)
   *  - tracker 主动反向 GET {publicUrl}/p2p/verify/echo,challenge 校验通过才允许入库
   *  - 本机自连(clientIp=loopback)豁免验证,但同样不写入 publicUrl(仅本地调试用)
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

    // publicUrl 决策(完全信任客户端自报)
    const isLoopback = clientIp.category === 'loopback'
    const decidedUrl = decide_public_url(payload.publicUrl)

    // 非本机场景:必须能确定可达 publicUrl,且能反向可达
    if (!isLoopback) {
      if (!decidedUrl) {
        throw new Error(
          '注册请求缺少有效的 publicUrl。请在 smanga.json 的 p2p.node.publicUrl\n' +
          '配置节点对外可达地址,例如:\n' +
          '  "example.com:9797/api"     (经 webui 反代)\n' +
          '  "http://1.2.3.4:9798"      (后端直连)\n' +
          '  "https://example.com"      (HTTPS 反代)\n' +
          '本项目不支持纯内网/CGNAT 节点接入'
        )
      }

      const check = await trackerReachabilityService.verify({ baseUrl: decidedUrl })
      if (!check.ok) {
        console.warn(
          `[tracker] 注册反向验证失败 publicUrl=${decidedUrl} reason=${check.reason}`
        )
        throw new Error(
          `节点公网可达性验证失败: ${check.reason}\n` +
          `tracker 无法从 ${decidedUrl} 拿到正确 challenge 回包。\n` +
          '请确认:\n' +
          '  - 节点服务正常运行且监听端口正确\n' +
          '  - 防火墙/安全组已放行该端口\n' +
          '  - NAT 后做好端口映射\n' +
          '  - publicUrl 可从 tracker 所在网络正常访问'
        )
      }
      console.log(
        `[tracker] 注册反向验证通过 publicUrl=${decidedUrl} elapsed=${check.elapsedMs}ms`
      )
    } else {
      console.log(`[tracker] 检测到本机自连(loopback),跳过反向验证`)
    }

    // 生成唯一 ID 与明文 token(只此一次返回)
    const nodeId = uuidv4()
    const rawToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const persistUrl = isLoopback ? null : (decidedUrl || null)

    await prisma.tracker_node.create({
      data: {
        nodeId,
        nodeToken: tokenHash,
        nodeName: payload.nodeName || null,
        // 本机自连情况下不入公网 url,避免污染 seeds 列表
        publicUrl: persistUrl,
        version: payload.version || null,
        userAgent: userAgent || null,
        online: 1,
        lastHeartbeat: new Date(),
      },
    })

    console.log(
      `[tracker] 节点注册成功 nodeId=${nodeId} ` +
      `publicUrl=${persistUrl || 'null(loopback)'} ` +
      `ipSource=${clientIp.source} ipCategory=${clientIp.category}`
    )

    return {
      nodeId,
      nodeToken: rawToken,
      publicUrl: persistUrl || '',
    }
  }

  /**
   * 心跳
   *
   * 反向验证策略(分轻重):
   *  - publicUrl 与数据库一致 → 不重复探测,仅刷新 lastHeartbeat
   *  - publicUrl 变化 / 之前 online=0 → 重做反向验证:
   *      - 通过:更新端点并 online=1
   *      - 失败:保持 online=0 并记录原因(不抛错,允许节点继续跑并在后续心跳重试)
   *  - loopback:豁免
   *
   * 关键:这里使用与 register 完全一致的 decide_public_url + reachability 链路,
   * 不会出现"DB 里 example.com:9797/api、反向验证却用 example.com:9798"的不一致。
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

    const isLoopback = clientIp.category === 'loopback'
    const decidedUrl = decide_public_url(payload.publicUrl)

    // 端点是否变化(仅在本次心跳能定出 url 时才比较)
    const existingUrl = normalize_public_url(existing.publicUrl || '') || null
    const endpointChanged = decidedUrl !== null && decidedUrl !== existingUrl
    const wasOffline = existing.online !== 1

    let online = 1
    let verifyReason: string | undefined

    if (!isLoopback) {
      if (!decidedUrl) {
        online = 0
        verifyReason = '缺少 publicUrl'
      } else if (endpointChanged || wasOffline) {
        const check = await trackerReachabilityService.verify({
          baseUrl: decidedUrl,
          expectNodeId: nodeId,
        })
        if (check.ok) {
          online = 1
          console.log(
            `[tracker] 心跳反向验证通过 nodeId=${nodeId} publicUrl=${decidedUrl} ` +
            `elapsed=${check.elapsedMs}ms (${endpointChanged ? '端点变更' : '离线恢复'})`
          )
        } else {
          online = 0
          verifyReason = check.reason
          console.warn(
            `[tracker] 心跳反向验证失败 nodeId=${nodeId} publicUrl=${decidedUrl} reason=${check.reason}`
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
        // 仅当本次心跳解析到有效 url 时才更新,避免用 null 覆盖已有端点
        ...(decidedUrl !== null && { publicUrl: isLoopback ? null : decidedUrl }),
      },
    })

    // 粗粒度 manifest 变更通知:该节点所在各群内,自上次心跳以来有 manifest 变化
    const notifications: Array<{ type: string; data?: any }> = []
    const lastHeartbeat = existing.lastHeartbeat
    if (lastHeartbeat) {
      try {
        const memberships = await prisma.tracker_membership.findMany({
          where: { nodeId },
          select: { trackerGroupId: true },
        })
        const groupIds = memberships.map((m) => m.trackerGroupId)
        if (groupIds.length) {
          const changes = await prisma.tracker_share_manifest.groupBy({
            by: ['trackerGroupId'],
            where: {
              trackerGroupId: { in: groupIds },
              updateTime: { gt: lastHeartbeat },
            },
            _count: { trackerShareManifestId: true },
            _max: { updateTime: true },
          })
          if (changes.length) {
            const groups = await prisma.tracker_group.findMany({
              where: { trackerGroupId: { in: changes.map((c) => c.trackerGroupId) } },
              select: { trackerGroupId: true, groupNo: true },
            })
            const gMap = new Map(groups.map((g) => [g.trackerGroupId, g.groupNo]))
            for (const c of changes) {
              const groupNo = gMap.get(c.trackerGroupId)
              if (!groupNo) continue
              notifications.push({
                type: 'manifest_changed',
                data: {
                  groupNo,
                  changedCount: c._count.trackerShareManifestId,
                  serverTime: c._max.updateTime?.getTime() ?? Date.now(),
                },
              })
            }
          }
        }
      } catch (e) {
        // 通知失败不影响心跳主流程
        console.warn('[tracker] 心跳 manifest 变更检查失败:', (e as Error).message)
      }
    }

    // reachability 失败也作为通知追加
    if (online === 0 && verifyReason) {
      notifications.push({ type: 'reachability_failed', data: { reason: verifyReason } })
    }

    return {
      publicUrl: isLoopback ? '' : (decidedUrl || existing.publicUrl || ''),
      serverTime: Date.now(),
      pendingNotifications: notifications,
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