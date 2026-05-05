/**
 * P2P 群组管理控制器(前端/用户侧)
 *
 * 路径:/api/p2p/group/*
 * 用户操作本节点自己的群组成员关系:
 *  - list/show    读取本地缓存
 *  - create       先调用 tracker 创建,再写入本地 p2p_group
 *  - join         先调用 tracker 加入,再写入本地 p2p_group
 *  - leave        先调用 tracker,再删除本地 p2p_group
 *  - refresh      同步 tracker 上的群列表到本地
 *
 * 鉴权:沿用 auth_middleware(用户 token),不走 p2p_peer_auth_middleware
 */

import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '#interfaces/response'
import { get_config } from '#utils/index'
import TrackerClient from '#services/p2p/tracker_client'
import p2pIdentityService from '#services/p2p/p2p_identity_service'
import { log_p2p_error } from '#utils/p2p_log'

function get_client(): TrackerClient | null {
  const cfg = get_config()?.p2p
  if (!cfg?.enable || !cfg?.role?.node) return null

  const id = p2pIdentityService.getIdentity()
  if (!id) return null

  const url = p2pIdentityService.pickTrackerUrl(cfg)
  if (!url) return null

  return new TrackerClient(url, id.nodeId, id.nodeToken)
}

export default class P2PGroupsController {
  /**
   * GET /api/p2p/group
   */
  async index({ response }: HttpContext) {
    const list = await prisma.p2p_group.findMany({ orderBy: { createTime: 'desc' } })
    return response.json(new ListResponse({ code: 0, message: '', list, count: list.length }))
  }

  async show({ params, response }: HttpContext) {
    const id = Number(params.id)
    const item = await prisma.p2p_group.findUnique({ where: { p2pGroupId: id } })
    if (!item) {
      return response.status(404).json(new SResponse({ code: 1, message: 'not found', status: 'not found' }))
    }
    return response.json(new SResponse({ code: 0, message: '', data: item }))
  }

  /**
   * POST /api/p2p/group/create
   * body: { groupName, describe, password, maxMembers }
   */
  async create({ request, response }: HttpContext) {
    const client = get_client()
    if (!client) {
      return response.status(400).json(new SResponse({ code: 1, message: 'P2P 未配置或未启用' }))
    }

    const { groupName, describe, password, maxMembers } = request.only([
      'groupName', 'describe', 'password', 'maxMembers',
    ])

    try {
      const res = await client.createGroup({ groupName, describe, password, maxMembers })
      const id = p2pIdentityService.getIdentity()!
      const cfg = get_config()?.p2p

      const local = await prisma.p2p_group.create({
        data: {
          groupNo: res.groupNo,
          groupName,
          describe: describe || null,
          ownerNodeId: id.nodeId,
          isOwner: 1,
          trackerUrl: p2pIdentityService.pickTrackerUrl(cfg) || '',
          memberCount: 1,
        },
      })
      return response.json(new SResponse({ code: 0, message: '创建成功', data: { local, remote: res } }))
    } catch (e: any) {
      log_p2p_error('group.create', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.response?.data?.message || e?.message || '创建失败' }))
    }
  }

  /**
   * POST /api/p2p/group/join
   * body: { groupNo, password?, inviteCode? }
   */
  async join({ request, response }: HttpContext) {
    const client = get_client()
    if (!client) {
      return response.status(400).json(new SResponse({ code: 1, message: 'P2P 未配置或未启用' }))
    }

    const { groupNo, password, inviteCode } = request.only(['groupNo', 'password', 'inviteCode'])

    try {
      const res = await client.joinGroup({ groupNo, password, inviteCode })
      const cfg = get_config()?.p2p

      const remoteGroup = res?.group || res
      const existed = await prisma.p2p_group.findUnique({ where: { groupNo } })
      if (existed) {
        return response.json(new SResponse({ code: 0, message: '已在群组中', data: existed }))
      }

      // tracker 旧版本可能不返回 ownerNodeId,这里给空串占位,后续 refresh 会同步真实值
      const ownerNodeId: string = remoteGroup?.ownerNodeId || ''
      const local = await prisma.p2p_group.create({
        data: {
          groupNo,
          groupName: remoteGroup?.groupName || groupNo,
          describe: remoteGroup?.describe || null,
          ownerNodeId,
          isOwner: 0,
          trackerUrl: p2pIdentityService.pickTrackerUrl(cfg) || '',
          memberCount: remoteGroup?.memberCount || 1,
        },
      })
      return response.json(new SResponse({ code: 0, message: '加入成功', data: local }))
    } catch (e: any) {
      log_p2p_error('group.join', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.response?.data?.message || e?.message || '加入失败' }))
    }
  }

  /**
   * POST /api/p2p/group/leave
   * body: { groupNo }
   */
  async leave({ request, response }: HttpContext) {
    const client = get_client()
    if (!client) {
      return response.status(400).json(new SResponse({ code: 1, message: 'P2P 未配置或未启用' }))
    }
    const { groupNo } = request.only(['groupNo'])

    try {
      await client.leaveGroup(groupNo)
    } catch (e: any) {
      // 即使 tracker 侧失败也继续清理本地,避免僵尸群组
      log_p2p_error('group.leave.tracker(忽略,继续清理本地)', e)
    }

    const local = await prisma.p2p_group.findUnique({ where: { groupNo } })
    if (local) {
      await prisma.p2p_local_share.deleteMany({ where: { p2pGroupId: local.p2pGroupId } })
      await prisma.p2p_peer_cache.deleteMany({ where: { p2pGroupId: local.p2pGroupId } })
      await prisma.p2p_transfer.deleteMany({ where: { p2pGroupId: local.p2pGroupId } })
      await prisma.p2p_group.delete({ where: { p2pGroupId: local.p2pGroupId } })
    }

    return response.json(new SResponse({ code: 0, message: '已退出' }))
  }

  /**
   * POST /api/p2p/group/refresh
   * 从 tracker 同步群列表到本地
   */
  async refresh({ response }: HttpContext) {
    const client = get_client()
    if (!client) {
      return response.status(400).json(new SResponse({ code: 1, message: 'P2P 未配置或未启用' }))
    }

    try {
      const remoteGroups: any[] = await client.myGroups()
      const id = p2pIdentityService.getIdentity()!
      const cfg = get_config()?.p2p

      for (const rg of remoteGroups) {
        // 兜底:若 tracker 未返回 ownerNodeId,且当前节点是 owner 角色,则使用本节点 id;否则置空字符串避免 prisma 校验失败
        const isSelfOwner = rg.role === 'owner'
        const ownerNodeId: string = rg.ownerNodeId || (isSelfOwner ? id.nodeId : '')
        const isOwner = ownerNodeId === id.nodeId ? 1 : 0

        await prisma.p2p_group.upsert({
          where: { groupNo: rg.groupNo },
          update: {
            groupName: rg.groupName,
            describe: rg.describe || null,
            ownerNodeId,
            isOwner,
            memberCount: rg.memberCount || 0,
            lastSyncTime: new Date(),
          },
          create: {
            groupNo: rg.groupNo,
            groupName: rg.groupName,
            describe: rg.describe || null,
            ownerNodeId,
            isOwner,
            trackerUrl: p2pIdentityService.pickTrackerUrl(cfg) || '',
            memberCount: rg.memberCount || 0,
          },
        })
      }
      return response.json(new SResponse({ code: 0, message: '同步完成', data: { count: remoteGroups.length } }))
    } catch (e: any) {
      log_p2p_error('group.refresh', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.response?.data?.message || e?.message || '同步失败' }))
    }
  }
}