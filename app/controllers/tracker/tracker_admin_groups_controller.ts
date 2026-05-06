/**
 * Tracker 管理员控制器
 *
 * 路径: /tracker-admin/group/*
 *
 * 与 /tracker/group/* 的区别:
 *  - /tracker/group/*       面向远端节点,鉴权方式 = X-Node-Id + X-Node-Token (走 tracker_auth_middleware)
 *  - /tracker-admin/group/* 面向本机 web 管理员,鉴权方式 = 用户 token + admin 角色 (走 auth_middleware)
 *
 * 仅当本机开启了 tracker 角色时才允许访问;否则返回 503。
 */
import type { HttpContext } from '@adonisjs/core/http'
import { ListResponse, SResponse } from '#interfaces/response'
import trackerGroupService from '#services/tracker/tracker_group_service'
import { log_tracker_error } from '#utils/p2p_log'
import { get_config } from '#utils/index'

/**
 * 总开关 + 角色校验
 * 不是 admin / 没开 tracker 角色都不允许
 */
function ensureTrackerEnabled({ request, response }: HttpContext): boolean {
  const p2p = get_config()?.p2p
  if (!p2p?.enable || !p2p?.role?.tracker) {
    response.status(503).json(new SResponse({ code: 1, message: '本机未启用 Tracker 角色' }))
    return false
  }
  // auth_middleware 已经把 user 挂到 request 上
  const user = (request as any).user
  if (!user || user.role !== 'admin') {
    response.status(403).json(new SResponse({ code: 1, message: '仅管理员可操作' }))
    return false
  }
  return true
}

export default class TrackerAdminGroupsController {
  /**
   * GET /tracker-admin/group?page=&pageSize=&keyword=&enable=
   */
  async index(ctx: HttpContext) {
    if (!ensureTrackerEnabled(ctx)) return
    const { request, response } = ctx
    try {
      const page = Number(request.input('page', 1))
      const pageSize = Number(request.input('pageSize', 20))
      const keyword = request.input('keyword') as string | undefined
      const enableRaw = request.input('enable')
      const enable = enableRaw === undefined || enableRaw === '' ? undefined : Number(enableRaw)

      const { list, count } = await trackerGroupService.adminListAll({
        page,
        pageSize,
        keyword,
        enable,
      })
      return response.json(new ListResponse({ code: 0, message: '', list: list as any, count }))
    } catch (err: any) {
      log_tracker_error('admin.group.index', err)
      return response.status(500).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * GET /tracker-admin/group/:groupNo
   */
  async show(ctx: HttpContext) {
    if (!ensureTrackerEnabled(ctx)) return
    const { params, response } = ctx
    try {
      const data = await trackerGroupService.adminDetail(params.groupNo)
      return response.json(new SResponse({ code: 0, message: '', data }))
    } catch (err: any) {
      log_tracker_error('admin.group.show', err)
      return response.status(404).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * GET /tracker-admin/group/:groupNo/members
   */
  async members(ctx: HttpContext) {
    if (!ensureTrackerEnabled(ctx)) return
    const { params, response } = ctx
    try {
      const list = await trackerGroupService.listMembers(params.groupNo)
      return response.json(
        new ListResponse({ code: 0, message: '', list: list as any, count: list.length })
      )
    } catch (err: any) {
      log_tracker_error('admin.group.members', err)
      return response.status(404).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * DELETE /tracker-admin/group/:groupNo/member/:nodeId
   */
  async kick(ctx: HttpContext) {
    if (!ensureTrackerEnabled(ctx)) return
    const { params, response } = ctx
    try {
      await trackerGroupService.adminKick(params.groupNo, params.nodeId)
      return response.json(new SResponse({ code: 0, message: '已移出群组' }))
    } catch (err: any) {
      log_tracker_error('admin.group.kick', err)
      return response.status(400).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * DELETE /tracker-admin/group/:groupNo
   * 解散群组(级联清理 membership / invite / share_index)
   */
  async destroy(ctx: HttpContext) {
    if (!ensureTrackerEnabled(ctx)) return
    const { params, response } = ctx
    try {
      const data = await trackerGroupService.adminDismiss(params.groupNo)
      return response.json(new SResponse({ code: 0, message: '已解散群组', data }))
    } catch (err: any) {
      log_tracker_error('admin.group.dismiss', err)
      return response.status(400).json(new SResponse({ code: 1, message: err.message }))
    }
  }
}