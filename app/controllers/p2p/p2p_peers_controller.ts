/**
 * P2P 群内节点与共享索引查询控制器(用户侧)
 *
 * 路径:/api/p2p/peer/*
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

export default class P2PPeersController {
  /**
   * GET /api/p2p/peer/members/:groupNo
   * 从 tracker 获取群成员并缓存到 p2p_peer_cache
   */
  async members({ params, response }: HttpContext) {
    const client = get_client()
    if (!client) {
      return response.status(400).json(new SResponse({ code: 1, message: 'P2P 未启用' }))
    }

    const groupNo = params.groupNo
    try {
      const members: any[] = await client.groupMembers(groupNo)
      const group = await prisma.p2p_group.findUnique({ where: { groupNo } })

      if (group) {
        // 同步到本地缓存
        for (const m of members) {
          await prisma.p2p_peer_cache.upsert({
            // 注: schema 中 @@unique([p2pGroupId, nodeId], map: "uniqueGroupNode")
            // map 仅作为数据库索引名;Prisma Client 实际复合键名按字段名拼接为 p2pGroupId_nodeId
            where: { p2pGroupId_nodeId: { p2pGroupId: group.p2pGroupId, nodeId: m.nodeId } },
            update: {
              nodeName: m.nodeName || null,
              publicHost: m.publicHost || null,
              publicPort: m.publicPort || null,
              localHost: m.localHost || null,
              localPort: m.localPort || null,
              online: m.online ? 1 : 0,
              version: m.version || null,
              lastSeen: m.lastHeartbeat ? new Date(m.lastHeartbeat) : null,
            },
            create: {
              p2pGroupId: group.p2pGroupId,
              nodeId: m.nodeId,
              nodeName: m.nodeName || null,
              publicHost: m.publicHost || null,
              publicPort: m.publicPort || null,
              localHost: m.localHost || null,
              localPort: m.localPort || null,
              online: m.online ? 1 : 0,
              version: m.version || null,
              lastSeen: m.lastHeartbeat ? new Date(m.lastHeartbeat) : null,
            },
          })
        }
      }

      return response.json(new ListResponse({ code: 0, message: '', list: members, count: members.length }))
    } catch (e: any) {
      log_p2p_error('peer.members', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.response?.data?.message || e?.message || '查询失败' }))
    }
  }

  /**
   * GET /api/p2p/peer/shares/:groupNo
   * 查询群内其他节点共享的资源索引(直接查 tracker)
   */
  async shares({ params, response }: HttpContext) {
    const client = get_client()
    if (!client) {
      return response.status(400).json(new SResponse({ code: 1, message: 'P2P 未启用' }))
    }
    const groupNo = params.groupNo
    try {
      const list: any[] = await client.listShares(groupNo)
      return response.json(new ListResponse({ code: 0, message: '', list, count: list.length }))
    } catch (e: any) {
      log_p2p_error('peer.shares', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.response?.data?.message || e?.message || '查询失败' }))
    }
  }

  /**
   * GET /api/p2p/peer/cache/:groupNo
   * 仅从本地缓存读取
   */
  async cache({ params, response }: HttpContext) {
    const groupNo = params.groupNo
    const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
    if (!group) {
      return response.json(new ListResponse({ code: 0, message: '', list: [], count: 0 }))
    }
    const list = await prisma.p2p_peer_cache.findMany({
      where: { p2pGroupId: group.p2pGroupId },
      orderBy: { lastSeen: 'desc' },
    })
    return response.json(new ListResponse({ code: 0, message: '', list, count: list.length }))
  }
}