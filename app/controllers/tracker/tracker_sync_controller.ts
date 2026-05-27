/**
 * Tracker 间同步接口
 *
 * 路由: /tracker/sync/*
 * 供其他 tracker 拉取数据用于对账同步
 *
 * 鉴权: X-Sync-Key 头,需与 tracker 配置的 syncKey 一致
 */

import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { get_config } from '#utils/index'
import { log_tracker_error } from '#utils/p2p_log'
import trackerShareService from '#services/tracker/tracker_share_service'

function checkSyncAuth(ctx: HttpContext): boolean {
  const syncKey = get_config()?.p2p?.tracker?.syncKey
  if (!syncKey) return false
  const provided = ctx.request.header('x-sync-key')
  return provided === syncKey
}

export default class TrackerSyncController {
  /**
   * GET /tracker/sync/groups
   * 返回本 tracker 上所有群组的基本信息
   */
  async groups({ request, response }: HttpContext) {
    if (!checkSyncAuth({ request, response } as HttpContext)) {
      return response.status(401).json({ code: 401, message: 'sync key invalid' })
    }
    try {
      const groups = await prisma.tracker_group.findMany({
        where: { enable: 1 },
        orderBy: { createTime: 'desc' },
        select: {
          groupNo: true,
          groupName: true,
          describe: true,
          password: true,
          ownerNodeId: true,
          maxMembers: true,
          memberCount: true,
          createTime: true,
          updateTime: true,
        },
      })
      return response.json({ code: 200, message: '', list: groups, count: groups.length })
    } catch (err: any) {
      log_tracker_error('sync.groups', err)
      return response.status(500).json({ code: 500, message: err.message })
    }
  }

  /**
   * GET /tracker/sync/nodes
   * 返回本 tracker 上所有节点信息(不含 token hash,仅公开字段)
   */
  async nodes({ request, response }: HttpContext) {
    if (!checkSyncAuth({ request, response } as HttpContext)) {
      return response.status(401).json({ code: 401, message: 'sync key invalid' })
    }
    try {
      const nodes = await prisma.tracker_node.findMany({
        orderBy: { createTime: 'desc' },
        select: {
          nodeId: true,
          nodeName: true,
          publicUrl: true,
          version: true,
          online: true,
          lastHeartbeat: true,
          createTime: true,
          updateTime: true,
        },
      })
      return response.json({ code: 200, message: '', list: nodes, count: nodes.length })
    } catch (err: any) {
      log_tracker_error('sync.nodes', err)
      return response.status(500).json({ code: 500, message: err.message })
    }
  }

  /**
   * GET /tracker/sync/group/:groupNo/members
   * 返回指定群组的成员列表
   */
  async groupMembers({ params, request, response }: HttpContext) {
    if (!checkSyncAuth({ request, response } as HttpContext)) {
      return response.status(401).json({ code: 401, message: 'sync key invalid' })
    }
    try {
      const { groupNo } = params
      const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
      if (!group) {
        return response.status(404).json({ code: 404, message: '群组不存在' })
      }

      const memberships = await prisma.tracker_membership.findMany({
        where: { trackerGroupId: group.trackerGroupId },
        include: { node: { select: { nodeId: true, nodeName: true, online: true, publicUrl: true } } },
        orderBy: { joinTime: 'asc' },
      })

      const members = memberships.map((m: any) => ({
        nodeId: m.nodeId,
        nodeName: m.node?.nodeName || null,
        role: m.role,
        online: m.node?.online ?? 0,
        publicUrl: m.node?.publicUrl || null,
        joinTime: m.joinTime,
      }))

      return response.json({ code: 200, message: '', list: members, count: members.length })
    } catch (err: any) {
      log_tracker_error('sync.groupMembers', err)
      return response.status(500).json({ code: 500, message: err.message })
    }
  }

  async groupShares({ params, request, response }: HttpContext) {
    if (!checkSyncAuth({ request, response } as HttpContext)) {
      return response.status(401).json({ code: 401, message: 'sync key invalid' })
    }
    try {
      const data = await trackerShareService.listGroupShares(params.groupNo, {
        page: 1,
        pageSize: 100000,
      })
      return response.json({ code: 200, message: '', list: data.list, count: data.count })
    } catch (err: any) {
      log_tracker_error('sync.groupShares', err)
      return response.status(500).json({ code: 500, message: err.message })
    }
  }

  async groupManifests({ params, request, response }: HttpContext) {
    if (!checkSyncAuth({ request, response } as HttpContext)) {
      return response.status(401).json({ code: 401, message: 'sync key invalid' })
    }
    try {
      const group = await prisma.tracker_group.findUnique({ where: { groupNo: params.groupNo } })
      if (!group) {
        return response.status(404).json({ code: 404, message: 'group not found' })
      }
      const list = await prisma.tracker_share_manifest.findMany({
        where: { trackerGroupId: group.trackerGroupId },
        orderBy: { updateTime: 'desc' },
      })
      return response.json({ code: 200, message: '', list, count: list.length, serverTime: Date.now() })
    } catch (err: any) {
      log_tracker_error('sync.groupManifests', err)
      return response.status(500).json({ code: 500, message: err.message })
    }
  }

  /**
   * GET /tracker/sync/peers
   * 返回本 tracker 的身份与已知 peer 列表
   *
   * 作用:
   *  - selfUrl: 告诉 peer "我现在叫什么名字"(域名迁移时会变)
   *  - knownUrls: 告诉 peer "我还知道哪些 tracker"(动态发现)
   *
   * 场景:
   *  - Tracker B 域名从 old.com 改为 new.com
   *  - Tracker A 同步时拉 B 的 peers 接口,发现 selfUrl=new.com ≠ old.com
   *  - A 自动将旧地址替换为新地址,无需人工干预
   */
  async peers({ request, response }: HttpContext) {
    if (!checkSyncAuth({ request, response } as HttpContext)) {
      return response.status(401).json({ code: 401, message: 'sync key invalid' })
    }
    try {
      const cfg = get_config()?.p2p
      const selfUrl = (cfg?.tracker?.publicUrl || '').replace(/\/+$/, '')
      const knownUrls: string[] = []

      // 先加自己
      if (selfUrl) {
        try {
          const u = new URL(selfUrl)
          if (!['localhost', '127.0.0.1', '::1'].includes(u.hostname)) {
            knownUrls.push(selfUrl)
          }
        } catch { /* 无效 URL 跳过 */ }
      }

      // 再加配置的 trackers
      if (cfg?.node?.trackers && Array.isArray(cfg.node.trackers)) {
        for (const t of cfg.node.trackers) {
          const normalized = (t as string).replace(/\/+$/, '')
          if (!normalized || knownUrls.includes(normalized)) continue
          try {
            const u = new URL(normalized)
            if (['localhost', '127.0.0.1', '::1'].includes(u.hostname)) continue
          } catch { continue }
          knownUrls.push(normalized)
        }
      }

      return response.json({
        code: 200,
        message: '',
        data: { selfUrl: selfUrl || null, knownUrls, count: knownUrls.length },
      })
    } catch (err: any) {
      log_tracker_error('sync.peers', err)
      return response.status(500).json({ code: 500, message: err.message })
    }
  }
}
