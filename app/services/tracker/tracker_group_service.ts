import prisma from '#start/prisma'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { get_config } from '#utils/index'
import { MemberRole } from '#type/p2p'
import type { CreateGroupPayload, JoinGroupPayload } from '#type/p2p'
import membershipCache from '#services/p2p/p2p_membership_cache'

/**
 * Tracker 群组服务
 * 负责群组的创建/加入/退出/成员管理/邀请码
 */
class TrackerGroupService {
  /**
   * 生成 6 位群组号(A-Z + 0-9),冲突重试
   */
  private async genGroupNo(): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去掉易混字符 I O 0 1
    for (let attempt = 0; attempt < 10; attempt++) {
      let no = ''
      for (let i = 0; i < 6; i++) {
        no += chars[Math.floor(Math.random() * chars.length)]
      }
      const exists = await prisma.tracker_group.findUnique({ where: { groupNo: no } })
      if (!exists) return no
    }
    throw new Error('生成群组号失败,请重试')
  }

  /**
   * 简易 hash(非 bcrypt,减少依赖;生产可换成 bcryptjs)
   * 空密码统一返回空字符串,代表"无密码群组"
   */
  private hashPassword(raw: string | undefined | null): string {
    if (raw === undefined || raw === null || raw === '') return ''
    const salt = get_config()?.serverKey || 'smanga-salt'
    return crypto.createHash('sha256').update(salt + ':' + raw).digest('hex')
  }

  /**
   * 创建群组
   */
  async create(ownerNodeId: string, payload: CreateGroupPayload) {
    const tc = get_config()?.p2p?.tracker || {}

    // 校验该节点已拥有的群组数
    const ownedCount = await prisma.tracker_group.count({
      where: { ownerNodeId, enable: 1 },
    })
    if (tc.maxGroupsPerNode && ownedCount >= tc.maxGroupsPerNode) {
      throw new Error('已达到该节点可创建群组数上限')
    }

    if (!payload.groupName?.trim()) throw new Error('群组名不能为空')

    const groupNo = await this.genGroupNo()
    const maxMembers = Math.min(
      payload.maxMembers ?? 50,
      tc.maxMembersPerGroup ?? 50
    )

    const group = await prisma.tracker_group.create({
      data: {
        groupNo,
        groupName: payload.groupName.trim(),
        describe: payload.describe || null,
        password: this.hashPassword(payload.password),
        ownerNodeId,
        maxMembers,
        memberCount: 1,
        enable: 1,
      },
    })

    // 群主自动加入为 owner
    await prisma.tracker_membership.create({
      data: {
        trackerGroupId: group.trackerGroupId,
        nodeId: ownerNodeId,
        role: MemberRole.owner,
      },
    })

    return group
  }

  /**
   * 加入群组
   */
  async join(nodeId: string, payload: JoinGroupPayload) {
    const group = await prisma.tracker_group.findUnique({
      where: { groupNo: payload.groupNo },
    })
    if (!group || group.enable === 0) throw new Error('群组不存在或已停用')

    // 已是成员,直接返回
    const existing = await prisma.tracker_membership.findFirst({
      where: { trackerGroupId: group.trackerGroupId, nodeId },
    })
    if (existing) return group

    if (group.memberCount >= group.maxMembers) {
      throw new Error('群组人数已满')
    }

    // 邀请码优先; 否则用密码
    if (payload.inviteCode) {
      const invite = await prisma.tracker_invite.findUnique({
        where: { code: payload.inviteCode },
      })
      if (!invite || invite.trackerGroupId !== group.trackerGroupId) {
        throw new Error('邀请码无效')
      }
      if (invite.usedTime) throw new Error('邀请码已使用')
      if (invite.expires && new Date(invite.expires) < new Date()) {
        throw new Error('邀请码已过期')
      }
      // 标记使用
      await prisma.tracker_invite.update({
        where: { trackerInviteId: invite.trackerInviteId },
        data: { usedBy: nodeId, usedTime: new Date() },
      })
    } else {
      // 群组无密码: 任何人都可加入
      if (group.password === '') {
        // pass
      } else {
        if (!payload.password) throw new Error('该群组需要密码或邀请码')
        if (this.hashPassword(payload.password) !== group.password) {
          throw new Error('密码错误')
        }
      }
    }

    await prisma.tracker_membership.create({
      data: {
        trackerGroupId: group.trackerGroupId,
        nodeId,
        role: MemberRole.member,
      },
    })
    await prisma.tracker_group.update({
      where: { trackerGroupId: group.trackerGroupId },
      data: { memberCount: { increment: 1 } },
    })

    return group
  }

  /**
   * 退出群组
   */
  async leave(nodeId: string, groupNo: string) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) throw new Error('群组不存在')

    if (group.ownerNodeId === nodeId) {
      throw new Error('群主无法退出群组,请先转让或解散')
    }

    const m = await prisma.tracker_membership.findFirst({
      where: { trackerGroupId: group.trackerGroupId, nodeId },
    })
    if (!m) return

    await prisma.tracker_membership.delete({
      where: { trackerMembershipId: m.trackerMembershipId },
    })
    await prisma.tracker_share_index.deleteMany({
      where: { trackerGroupId: group.trackerGroupId, nodeId },
    })
    await prisma.tracker_group.update({
      where: { trackerGroupId: group.trackerGroupId },
      data: { memberCount: { decrement: 1 } },
    })

    // 主动失效成员缓存(防止 /p2p/serve 继续放行)
    membershipCache.invalidate(nodeId, groupNo)
  }

  /**
   * 踢人(只有群主/管理员可执行)
   */
  async kick(operatorNodeId: string, groupNo: string, targetNodeId: string) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) throw new Error('群组不存在')

    if (group.ownerNodeId !== operatorNodeId) {
      throw new Error('只有群主可以踢人')
    }
    if (targetNodeId === operatorNodeId) {
      throw new Error('不能踢出自己')
    }

    await this.leave(targetNodeId, groupNo)
  }

  /**
   * 查询节点加入的群组列表
   */
  async listMine(nodeId: string) {
    const memberships = await prisma.tracker_membership.findMany({
      where: { nodeId },
      include: { group: true },
      orderBy: { joinTime: 'desc' },
    })
    return memberships.map((m) => ({
      groupNo: m.group.groupNo,
      groupName: m.group.groupName,
      describe: m.group.describe,
      ownerNodeId: m.group.ownerNodeId,
      role: m.role,
      memberCount: m.group.memberCount,
      maxMembers: m.group.maxMembers,
      enable: m.group.enable,
      joinTime: m.joinTime,
    }))
  }

  /**
   * 群组成员列表
   */
  async listMembers(groupNo: string) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) throw new Error('群组不存在')

    const memberships = await prisma.tracker_membership.findMany({
      where: { trackerGroupId: group.trackerGroupId },
      include: { node: true },
      orderBy: { joinTime: 'asc' },
    })

    return memberships.map((m) => ({
      nodeId: m.nodeId,
      nodeName: m.node.nodeName,
      role: m.role,
      online: m.node.online,
      publicHost: m.node.publicHost,
      publicPort: m.node.publicPort,
      localHost: m.node.localHost,
      localPort: m.node.localPort,
      version: m.node.version,
      lastHeartbeat: m.node.lastHeartbeat,
      joinTime: m.joinTime,
    }))
  }

  /**
   * 生成邀请码
   */
  async createInvite(operatorNodeId: string, groupNo: string, expiresHours?: number) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) throw new Error('群组不存在')
    if (group.ownerNodeId !== operatorNodeId) {
      throw new Error('只有群主可以生成邀请码')
    }

    const code = uuidv4()
    const expires = expiresHours
      ? new Date(Date.now() + expiresHours * 3600 * 1000)
      : null

    await prisma.tracker_invite.create({
      data: {
        trackerGroupId: group.trackerGroupId,
        code,
        createdBy: operatorNodeId,
        expires,
      },
    })
    return { code, expires }
  }

  /**
   * 解散群组(只有群主可执行)
   * 级联清理 share_index / invite / membership / group,并失效成员缓存
   */
  async dismiss(operatorNodeId: string, groupNo: string) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) throw new Error('群组不存在')
    if (group.ownerNodeId !== operatorNodeId) {
      throw new Error('只有群主可以解散群组')
    }

    const trackerGroupId = group.trackerGroupId
    await prisma.$transaction([
      prisma.tracker_share_index.deleteMany({ where: { trackerGroupId } }),
      prisma.tracker_invite.deleteMany({ where: { trackerGroupId } }),
      prisma.tracker_membership.deleteMany({ where: { trackerGroupId } }),
      prisma.tracker_group.delete({ where: { trackerGroupId } }),
    ])

    membershipCache.invalidateByGroup(groupNo)
    return { trackerGroupId, groupNo }
  }

  /**
   * 校验节点是否为某群组成员(供 P2P serve 反查)
   */
  async isMember(nodeId: string, groupNo: string): Promise<boolean> {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group || group.enable === 0) return false
    const m = await prisma.tracker_membership.findFirst({
      where: { trackerGroupId: group.trackerGroupId, nodeId },
    })
    return !!m
  }

  // ==========================================================
  // ⬇⬇⬇ Tracker 管理员接口(本机 web 管理页使用,不走节点 token) ⬇⬇⬇
  // ==========================================================

  /**
   * 管理员: 列出 tracker 上所有群组(支持关键字过滤 + 分页)
   */
  async adminListAll(params: {
    page?: number
    pageSize?: number
    keyword?: string
    enable?: number
  }) {
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || 20))
    const where: any = {}
    if (params.enable !== undefined && params.enable !== null && !Number.isNaN(Number(params.enable))) {
      where.enable = Number(params.enable)
    }
    if (params.keyword && params.keyword.trim()) {
      const kw = params.keyword.trim()
      where.OR = [
        { groupNo: { contains: kw } },
        { groupName: { contains: kw } },
        { describe: { contains: kw } },
        { ownerNodeId: { contains: kw } },
      ]
    }

    const [list, count] = await Promise.all([
      prisma.tracker_group.findMany({
        where,
        orderBy: { createTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.tracker_group.count({ where }),
    ])

    // 附带群主节点信息
    const ownerIds = Array.from(new Set(list.map((g) => g.ownerNodeId).filter(Boolean)))
    const owners = ownerIds.length
      ? await prisma.tracker_node.findMany({
          where: { nodeId: { in: ownerIds } },
          select: { nodeId: true, nodeName: true, online: true, lastHeartbeat: true },
        })
      : []
    const ownerMap = new Map(owners.map((o) => [o.nodeId, o]))

    return {
      list: list.map((g) => ({
        trackerGroupId: g.trackerGroupId,
        groupNo: g.groupNo,
        groupName: g.groupName,
        describe: g.describe,
        ownerNodeId: g.ownerNodeId,
        ownerNodeName: ownerMap.get(g.ownerNodeId)?.nodeName || null,
        ownerOnline: ownerMap.get(g.ownerNodeId)?.online ?? 0,
        maxMembers: g.maxMembers,
        memberCount: g.memberCount,
        enable: g.enable,
        createTime: g.createTime,
        updateTime: g.updateTime,
      })),
      count,
    }
  }

  /**
   * 管理员: 查看群组详情(含成员、邀请码、索引数等聚合信息)
   */
  async adminDetail(groupNo: string) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) throw new Error('群组不存在')

    const [members, inviteCount, shareIndexCount] = await Promise.all([
      this.listMembers(groupNo),
      prisma.tracker_invite.count({ where: { trackerGroupId: group.trackerGroupId } }),
      prisma.tracker_share_index.count({ where: { trackerGroupId: group.trackerGroupId } }),
    ])

    return {
      group: {
        trackerGroupId: group.trackerGroupId,
        groupNo: group.groupNo,
        groupName: group.groupName,
        describe: group.describe,
        ownerNodeId: group.ownerNodeId,
        maxMembers: group.maxMembers,
        memberCount: group.memberCount,
        enable: group.enable,
        hasPassword: !!group.password,
        createTime: group.createTime,
        updateTime: group.updateTime,
      },
      members,
      inviteCount,
      shareIndexCount,
    }
  }

  /**
   * 管理员: 解散群组 —— 级联清理 membership / invite / share_index / group
   */
  async adminDismiss(groupNo: string) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) throw new Error('群组不存在')

    const trackerGroupId = group.trackerGroupId

    // 事务保证一致性
    await prisma.$transaction([
      prisma.tracker_share_index.deleteMany({ where: { trackerGroupId } }),
      prisma.tracker_invite.deleteMany({ where: { trackerGroupId } }),
      prisma.tracker_membership.deleteMany({ where: { trackerGroupId } }),
      prisma.tracker_group.delete({ where: { trackerGroupId } }),
    ])

    // 清理该群所有节点的成员缓存
    membershipCache.invalidateByGroup(groupNo)

    return { trackerGroupId, groupNo }
  }

  /**
   * 管理员: 强制踢出成员(不要求自己是群主/操作者也无需是节点)
   * 群主不能被踢(需走解散流程)
   */
  async adminKick(groupNo: string, targetNodeId: string) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) throw new Error('群组不存在')
    if (group.ownerNodeId === targetNodeId) {
      throw new Error('不能踢出群主,请使用"解散群组"')
    }

    const m = await prisma.tracker_membership.findFirst({
      where: { trackerGroupId: group.trackerGroupId, nodeId: targetNodeId },
    })
    if (!m) throw new Error('该节点不是群成员')

    await prisma.$transaction([
      prisma.tracker_membership.delete({ where: { trackerMembershipId: m.trackerMembershipId } }),
      prisma.tracker_share_index.deleteMany({
        where: { trackerGroupId: group.trackerGroupId, nodeId: targetNodeId },
      }),
      prisma.tracker_group.update({
        where: { trackerGroupId: group.trackerGroupId },
        data: { memberCount: { decrement: 1 } },
      }),
    ])

    // 主动失效被踢节点的成员缓存
    membershipCache.invalidate(targetNodeId, groupNo)
  }
}

export default new TrackerGroupService()