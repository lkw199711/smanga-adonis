import type { HttpContext } from '@adonisjs/core/http'
import { SResponse } from '#interfaces/response'
import trackerNodeService from '#services/tracker/tracker_node_service'
import { log_tracker_error } from '#utils/p2p_log'

/**
 * Tracker 节点生命周期接口
 * 路由: /tracker/node/*
 */
export default class TrackerNodesController {
  /**
   * POST /tracker/node/register
   */
  async register({ request, response }: HttpContext) {
    try {
      const payload = request.only([
        'nodeName',
        'version',
        'publicHost',
        'publicPort',
        'localHost',
        'localPort',
        'inviteCode',
      ])
      const remoteIp = request.ip()
      const userAgent = request.header('user-agent')

      const result = await trackerNodeService.register(payload, remoteIp, userAgent)

      return response.json(new SResponse({ code: 0, message: '节点注册成功', data: result }))
    } catch (err: any) {
      log_tracker_error('node.register', err)
      return response
        .status(400)
        .json(new SResponse({ code: 1, message: err.message || '注册失败', status: 'register failed' }))
    }
  }

  /**
   * POST /tracker/node/heartbeat
   */
  async heartbeat({ request, response }: HttpContext) {
    try {
      const nodeId = (request as any).trackerNodeId as string
      const payload = request.only(['publicHost', 'publicPort', 'localHost', 'localPort'])
      const remoteIp = request.ip()

      const result = await trackerNodeService.heartbeat(nodeId, payload, remoteIp)

      return response.json(new SResponse({ code: 0, message: '', data: result }))
    } catch (err: any) {
      log_tracker_error('node.heartbeat', err)
      return response
        .status(500)
        .json(new SResponse({ code: 1, message: err.message || '心跳失败' }))
    }
  }

  /**
   * PATCH /tracker/node/me
   */
  async update({ request, response }: HttpContext) {
    try {
      const nodeId = (request as any).trackerNodeId as string
      const data = request.only(['nodeName'])
      const node = await trackerNodeService.update(nodeId, data)
      return response.json(new SResponse({ code: 0, message: '更新成功', data: node }))
    } catch (err: any) {
      log_tracker_error('node.update', err)
      return response.status(500).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * DELETE /tracker/node/me
   */
  async deregister({ request, response }: HttpContext) {
    try {
      const nodeId = (request as any).trackerNodeId as string
      await trackerNodeService.deregister(nodeId)
      return response.json(new SResponse({ code: 0, message: '节点已注销' }))
    } catch (err: any) {
      log_tracker_error('node.deregister', err)
      return response.status(500).json(new SResponse({ code: 1, message: err.message }))
    }
  }
}