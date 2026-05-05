import type { HttpContext } from '@adonisjs/core/http'
import { ListResponse, SResponse } from '#interfaces/response'
import trackerShareService from '#services/tracker/tracker_share_service'
import { log_tracker_error } from '#utils/p2p_log'

/**
 * Tracker 共享索引接口
 * 路由: /tracker/group/:groupNo/shares , /tracker/group/:groupNo/announce
 */
export default class TrackerSharesController {
  /**
   * POST /tracker/group/:groupNo/announce
   */
  async announce({ params, request, response }: HttpContext) {
    try {
      const nodeId = (request as any).trackerNodeId as string
      const payload = request.only(['shares']) as { shares: any[] }
      const result = await trackerShareService.announce(
        nodeId,
        params.groupNo,
        payload as any
      )
      return response.json(new SResponse({ code: 0, message: '上报成功', data: result }))
    } catch (err: any) {
      log_tracker_error('share.announce', err)
      return response.status(400).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * GET /tracker/group/:groupNo/shares?page=&pageSize=&keyword=
   */
  async index({ params, request, response }: HttpContext) {
    try {
      const { page, pageSize, keyword } = request.only(['page', 'pageSize', 'keyword'])
      const { list, count } = await trackerShareService.listGroupShares(params.groupNo, {
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        keyword,
      })
      return response.json(
        new ListResponse({ code: 0, message: '', list: list as any, count })
      )
    } catch (err: any) {
      log_tracker_error('share.list', err)
      return response.status(400).json(new SResponse({ code: 1, message: err.message }))
    }
  }
}