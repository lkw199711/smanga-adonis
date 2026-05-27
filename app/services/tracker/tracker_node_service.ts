import prisma from '#start/prisma'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { get_config } from '#utils/index'
import membershipCache from '#services/p2p/p2p_membership_cache'
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
   * 管理员: 查看当前 tracker 注册节点列表.
   */
  async adminListAll(params: {
    page?: number
    pageSize?: number
    keyword?: string
    online?: number
    banned?: number
  }) {
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || 20))
    const where: any = {}

    if (params.online !== undefined && params.online !== null && !Number.isNaN(Number(params.online))) {
      where.online = Number(params.online)
    }
    if (params.banned !== undefined && params.banned !== null && !Number.isNaN(Number(params.banned))) {
      where.banned = Number(params.banned)
    }
    if (params.keyword && params.keyword.trim()) {
      const kw = params.keyword.trim()
      where.OR = [
        { nodeId: { contains: kw } },
        { nodeName: { contains: kw } },
        { publicUrl: { contains: kw } },
        { version: { contains: kw } },
        { userAgent: { contains: kw } },
        { bannedReason: { contains: kw } },
      ]
    }

    const [list, count] = await Promise.all([
      prisma.tracker_node.findMany({
        where,
        orderBy: { updateTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          trackerNodeId: true,
          nodeId: true,
          nodeName: true,
          publicUrl: true,
          version: true,
          userAgent: true,
          online: true,
          lastHeartbeat: true,
          totalUpload: true,
          totalDownload: true,
          banned: true,
          bannedReason: true,
          createTime: true,
          updateTime: true,
        },
      }),
      prisma.tracker_node.count({ where }),
    ])

    const nodeIds = list.map((n) => n.nodeId)
    const [membershipCounts, ownedGroupCounts, shareIndexCounts, shareManifestCounts] =
      nodeIds.length
        ? await Promise.all([
            prisma.tracker_membership.groupBy({
              by: ['nodeId'],
              where: { nodeId: { in: nodeIds } },
              _count: { nodeId: true },
            }),
            prisma.tracker_group.groupBy({
              by: ['ownerNodeId'],
              where: { ownerNodeId: { in: nodeIds } },
              _count: { ownerNodeId: true },
            }),
            prisma.tracker_share_index.groupBy({
              by: ['nodeId'],
              where: { nodeId: { in: nodeIds } },
              _count: { nodeId: true },
            }),
            prisma.tracker_share_manifest.groupBy({
              by: ['nodeId'],
              where: { nodeId: { in: nodeIds } },
              _count: { nodeId: true },
            }),
          ])
        : [[], [], [], []]

    const membershipMap = new Map(membershipCounts.map((r) => [r.nodeId, r._count.nodeId]))
    const ownedGroupMap = new Map(ownedGroupCounts.map((r) => [r.ownerNodeId, r._count.ownerNodeId]))
    const shareIndexMap = new Map(shareIndexCounts.map((r) => [r.nodeId, r._count.nodeId]))
    const shareManifestMap = new Map(shareManifestCounts.map((r) => [r.nodeId, r._count.nodeId]))

    return {
      list: list.map((n) => ({
        ...n,
        totalUpload: n.totalUpload.toString(),
        totalDownload: n.totalDownload.toString(),
        groupCount: membershipMap.get(n.nodeId) || 0,
        ownedGroupCount: ownedGroupMap.get(n.nodeId) || 0,
        shareIndexCount: shareIndexMap.get(n.nodeId) || 0,
        shareManifestCount: shareManifestMap.get(n.nodeId) || 0,
      })),
      count,
    }
  }

  /**
   * 管理员: 节点详情,包含所在群组与拥有群组.
   */
  async adminDetail(nodeId: string) {
    const node = await prisma.tracker_node.findUnique({
      where: { nodeId },
      select: {
        trackerNodeId: true,
        nodeId: true,
        nodeName: true,
        publicUrl: true,
        version: true,
        userAgent: true,
        online: true,
        lastHeartbeat: true,
        totalUpload: true,
        totalDownload: true,
        banned: true,
        bannedReason: true,
        createTime: true,
        updateTime: true,
      },
    })
    if (!node) throw new Error('节点不存在')

    const [memberships, ownedGroups, shareIndexCount, shareManifestCount] = await Promise.all([
      prisma.tracker_membership.findMany({
        where: { nodeId },
        include: {
          group: {
            select: {
              trackerGroupId: true,
              groupNo: true,
              groupName: true,
              ownerNodeId: true,
              enable: true,
              memberCount: true,
              createTime: true,
              updateTime: true,
            },
          },
        },
        orderBy: { joinTime: 'desc' },
      }),
      prisma.tracker_group.findMany({
        where: { ownerNodeId: nodeId },
        select: {
          trackerGroupId: true,
          groupNo: true,
          groupName: true,
          enable: true,
          memberCount: true,
          createTime: true,
          updateTime: true,
        },
        orderBy: { createTime: 'desc' },
      }),
      prisma.tracker_share_index.count({ where: { nodeId } }),
      prisma.tracker_share_manifest.count({ where: { nodeId } }),
    ])

    return {
      node: {
        ...node,
        totalUpload: node.totalUpload.toString(),
        totalDownload: node.totalDownload.toString(),
      },
      memberships: memberships.map((m) => ({
        trackerMembershipId: m.trackerMembershipId,
        role: m.role,
        joinTime: m.joinTime,
        lastAnnounce: m.lastAnnounce,
        group: m.group,
      })),
      ownedGroups,
      shareIndexCount,
      shareManifestCount,
    }
  }

  /**
   * 管理员: 封禁/解封节点.
   */
  async adminSetBan(nodeId: string, data: { banned: number; bannedReason?: string }) {
    const banned = Number(data.banned) === 1 ? 1 : 0
    return prisma.tracker_node.update({
      where: { nodeId },
      data: {
        banned,
        bannedReason: banned ? data.bannedReason || null : null,
        ...(banned ? { online: 0 } : {}),
      },
    })
  }

  /**
   * 管理员: 注销节点.
   * 若该节点是群主,会同时删除其拥有的群组,否则 tracker_group.ownerNodeId 外键会阻止删除节点.
   */
  async adminDeregister(nodeId: string) {
    const node = await prisma.tracker_node.findUnique({ where: { nodeId } })
    if (!node) throw new Error('节点不存在')

    const memberships = await prisma.tracker_membership.findMany({
      where: { nodeId },
      select: { trackerGroupId: true, group: { select: { groupNo: true } } },
    })
    const ownedGroups = await prisma.tracker_group.findMany({
      where: { ownerNodeId: nodeId },
      select: { trackerGroupId: true, groupNo: true },
    })
    const ownedGroupIds = ownedGroups.map((g) => g.trackerGroupId)
    const ownedGroupIdSet = new Set(ownedGroupIds)
    const memberGroupIds = Array.from(
      new Set(memberships.map((m) => m.trackerGroupId).filter((id) => !ownedGroupIdSet.has(id)))
    )

    await prisma.$transaction(async (tx) => {
      if (ownedGroupIds.length) {
        await tx.tracker_share_manifest.deleteMany({ where: { trackerGroupId: { in: ownedGroupIds } } })
        await tx.tracker_share_index.deleteMany({ where: { trackerGroupId: { in: ownedGroupIds } } })
        await tx.tracker_invite.deleteMany({ where: { trackerGroupId: { in: ownedGroupIds } } })
        await tx.tracker_membership.deleteMany({ where: { trackerGroupId: { in: ownedGroupIds } } })
        await tx.tracker_group.deleteMany({ where: { trackerGroupId: { in: ownedGroupIds } } })
      }

      await tx.tracker_share_manifest.deleteMany({ where: { nodeId } })
      await tx.tracker_share_index.deleteMany({ where: { nodeId } })
      await tx.tracker_membership.deleteMany({ where: { nodeId } })

      for (const trackerGroupId of memberGroupIds) {
        const memberCount = await tx.tracker_membership.count({ where: { trackerGroupId } })
        await tx.tracker_group.update({
          where: { trackerGroupId },
          data: { memberCount },
        })
      }

      await tx.tracker_node.delete({ where: { nodeId } })
    })

    for (const m of memberships) {
      membershipCache.invalidate(nodeId, m.group.groupNo)
    }
    for (const g of ownedGroups) {
      membershipCache.invalidateByGroup(g.groupNo)
    }

    return {
      nodeId,
      removedGroupCount: ownedGroups.length,
      removedMembershipCount: memberships.length,
    }
  }

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
          '  "http://1.2.3.4:9797/api"  (Adonis 统一服务)\n' +
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
          '  - 若使用 IPv6 地址,请确保 tracker 所在网络支持 IPv6 出站(双栈环境)\n' +
          '  - 若 tracker 仅 IPv4,请为节点配置一个 IPv4 可达的 publicUrl\n' +
          '  - NAT 后做好端口映射'
        )
      }
      console.log(
        `[tracker] 注册反向验证通过 publicUrl=${decidedUrl} elapsed=${check.elapsedMs}ms`
      )
    } else {
      console.log(`[tracker] 检测到本机自连(loopback),跳过反向验证`)
    }

    // 优先使用客户端提供的 serverKey 作为 nodeId,保证同实例始终注册为同一节点
    const nodeId = payload.serverKey || uuidv4()

    const persistUrl = isLoopback ? null : (decidedUrl || null)

    await prisma.tracker_node.upsert({
      where: { nodeId },
      update: {
        nodeName: payload.nodeName || undefined,
        publicUrl: persistUrl || undefined,
        version: payload.version || undefined,
        userAgent: userAgent || undefined,
        online: 1,
        lastHeartbeat: new Date(),
      },
      create: {
        nodeId,
        nodeToken: '',
        nodeName: payload.nodeName || null,
        publicUrl: persistUrl || null,
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
   * 不会出现"DB 里 example.com:9797/api、反向验证却用其它后端端口"的不一致。
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
        // 心跳缺 publicUrl 但节点此前已存有效 publicUrl 且在线 → 不降级
        // (例如 checkNodeOnline 发送的探测心跳不应导致下线)
        if (existing.publicUrl && is_reportable_public_url(existing.publicUrl) && !wasOffline) {
          // 保持 online=1，仅刷新时间戳
        } else {
          online = 0
          verifyReason = '缺少 publicUrl'
        }
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

    // 构建已知 tracker 列表(供节点动态发现新 tracker)
    // 包含:自己的 publicUrl + 配置的 trackers 中所有非 loopback 地址
    const knownTrackers: string[] = []
    const cfg = get_config()?.p2p
    if (cfg?.tracker?.publicUrl) {
      const selfUrl = (cfg.tracker.publicUrl as string).replace(/\/+$/, '')
      if (selfUrl) knownTrackers.push(selfUrl)
    }
    if (cfg?.node?.trackers && Array.isArray(cfg.node.trackers)) {
      for (const t of cfg.node.trackers) {
        const normalized = (t as string).replace(/\/+$/, '')
        if (!normalized) continue
        // 去重且排除 loopback
        try {
          const u = new URL(normalized)
          if (['localhost', '127.0.0.1', '::1'].includes(u.hostname)) continue
        } catch { continue }
        if (!knownTrackers.includes(normalized)) {
          knownTrackers.push(normalized)
        }
      }
    }

    return {
      publicUrl: isLoopback ? '' : (decidedUrl || existing.publicUrl || ''),
      serverTime: Date.now(),
      pendingNotifications: notifications,
      knownTrackers,
    }
  }

  /**
   * 导入节点(从其他 tracker 同步而来)
   *
   * 与 register 的区别:
   *  - 使用调用方提供的 nodeId,不生成新 ID
   *  - 不做可达性验证(节点已由源 tracker 验证过)
   *  - 不做邀请码/节点上限等注册限制(这是同步,不是新注册)
   *  - upsert 语义:已存在则更新信息,不存在则创建
   */
  async importNode(payload: {
    nodeId: string
    nodeName?: string | null
    publicUrl?: string | null
    version?: string | null
    userAgent?: string | null
  }): Promise<{ nodeId: string; publicUrl: string }> {
    const decidedUrl = decide_public_url(payload.publicUrl)

    await prisma.tracker_node.upsert({
      where: { nodeId: payload.nodeId },
      update: {
        nodeName: payload.nodeName || undefined,
        publicUrl: decidedUrl || undefined,
        version: payload.version || undefined,
        userAgent: payload.userAgent || undefined,
        online: 1,
        lastHeartbeat: new Date(),
      },
      create: {
        nodeId: payload.nodeId,
        nodeToken: '',
        nodeName: payload.nodeName || null,
        publicUrl: decidedUrl || null,
        version: payload.version || null,
        userAgent: payload.userAgent || null,
        online: 1,
        lastHeartbeat: new Date(),
      },
    })

    console.log(
      `[tracker] 节点导入成功 nodeId=${payload.nodeId} ` +
      `publicUrl=${decidedUrl || 'null'}`
    )

    return { nodeId: payload.nodeId, publicUrl: decidedUrl || '' }
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
