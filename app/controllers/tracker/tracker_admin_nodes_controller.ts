/**
 * Tracker 节点管理员控制器
 *
 * 路径: /tracker-admin/node/*
 * 面向本机 web 管理员,用于直接管理注册到当前 tracker 的 peer 节点.
 */
import type { HttpContext } from '@adonisjs/core/http'
import trackerNodeService from '#services/tracker/tracker_node_service'
import { log_tracker_error } from '#utils/p2p_log'
import { get_config } from '#utils/index'
import {
  banTrackerAdminNodeValidator,
  listTrackerAdminNodeValidator,
  trackerNodeIdParamValidator,
} from '#validators/tracker'

function ensureTrackerEnabled({ request, response }: HttpContext): boolean {
  const p2p = get_config()?.p2p
  if (!p2p?.enable || !p2p?.role?.tracker) {
    response.status(503).json({ code: 503, message: '本机未启用 Tracker 角色' })
    return false
  }

  const user = (request as any).user
  if (!user || user.role !== 'admin') {
    response.status(403).json({ code: 403, message: '仅管理员可操作' })
    return false
  }
  return true
}

export default class TrackerAdminNodesController {
  /**
   * GET /tracker-admin/node?page=&pageSize=&keyword=&online=&banned=
   */
  async index(ctx: HttpContext) {
    if (!ensureTrackerEnabled(ctx)) return
    const { request, response } = ctx
    try {
      const { page, pageSize, keyword, online, banned } =
        await listTrackerAdminNodeValidator.validate(request.qs())

      const { list, count } = await trackerNodeService.adminListAll({
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
        keyword,
        online: online === undefined || online === '' ? undefined : Number(online),
        banned: banned === undefined || banned === '' ? undefined : Number(banned),
      })

      return response.json({ code: 200, message: '', list: list as any, count })
    } catch (err: any) {
      log_tracker_error('admin.node.index', err)
      return response.status(500).json({ code: 500, message: err.message })
    }
  }

  /**
   * GET /tracker-admin/node/:nodeId
   */
  async show(ctx: HttpContext) {
    if (!ensureTrackerEnabled(ctx)) return
    const { params, response } = ctx
    try {
      const { nodeId } = await trackerNodeIdParamValidator.validate(params)
      const data = await trackerNodeService.adminDetail(nodeId)
      return response.json({ code: 200, message: '', data })
    } catch (err: any) {
      log_tracker_error('admin.node.show', err)
      return response.status(404).json({ code: 404, message: err.message })
    }
  }

  /**
   * PUT /tracker-admin/node/:nodeId/ban
   */
  async ban(ctx: HttpContext) {
    if (!ensureTrackerEnabled(ctx)) return
    const { params, request, response } = ctx
    try {
      const { nodeId } = await trackerNodeIdParamValidator.validate(params)
      const payload = await banTrackerAdminNodeValidator.validate(request.all())
      const data = await trackerNodeService.adminSetBan(nodeId, {
        banned: Number(payload.banned),
        bannedReason: payload.bannedReason,
      })
      return response.json({ code: 200, message: Number(payload.banned) === 1 ? '已封禁节点' : '已解封节点', data })
    } catch (err: any) {
      log_tracker_error('admin.node.ban', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }

  /**
   * DELETE /tracker-admin/node/:nodeId
   */
  async destroy(ctx: HttpContext) {
    if (!ensureTrackerEnabled(ctx)) return
    const { params, response } = ctx
    try {
      const { nodeId } = await trackerNodeIdParamValidator.validate(params)
      const data = await trackerNodeService.adminDeregister(nodeId)
      return response.json({ code: 200, message: '已注销节点', data })
    } catch (err: any) {
      log_tracker_error('admin.node.destroy', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }
}
