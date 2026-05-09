import type { HttpContext } from '@adonisjs/core/http'
import { SResponse } from '#interfaces/response'
import trackerNodeService from '#services/tracker/tracker_node_service'
import { log_tracker_error } from '#utils/p2p_log'
import { resolve_client_ip } from '#utils/ip_resolver'
import {
  registerTrackerNodeValidator,
  heartbeatTrackerNodeValidator,
  updateTrackerNodeValidator,
} from '#validators/tracker'

/**
 * Tracker 节点生命周期接口
 * 路由: /tracker/node/*
 */
export default class TrackerNodesController {
  /**
   * POST /tracker/node/register
   *
   * publicUrl 策略:
   *  - 完全信任节点自报的 publicUrl (http(s)://host:port[/path])
   *  - tracker 侧仅做规范化(自动补 http:// 前缀、去尾斜杠)与反向可达性验证
   *  - 不再基于 request.ip / localPort 做任何推断
   */
  async register(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const payload = await registerTrackerNodeValidator.validate(request.all())
      const clientIp = resolve_client_ip(ctx)
      const userAgent = request.header('user-agent')

      const result = await trackerNodeService.register(payload, clientIp, userAgent)

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
  async heartbeat(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const nodeId = (request as any).trackerNodeId as string
      const payload = await heartbeatTrackerNodeValidator.validate(request.all())
      const clientIp = resolve_client_ip(ctx)

      const result = await trackerNodeService.heartbeat(nodeId, payload, clientIp)

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
      const data = await updateTrackerNodeValidator.validate(request.all())
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

  /**
   * GET /tracker/node/whoami
   *
   * 节点诊断辅助:返回 tracker 视角下的客户端真实 IP 与分类。
   * 用途:
   *  - 节点启动后自检自己到底是"公网直连/NAT/反代后"哪种形态
   *  - 帮助用户定位 seeds 为何连不上(tracker 看到的是私网则不可被外部访问)
   *
   * 该接口公开访问(无需 token),不泄漏 tracker 内部信息。
   */
  async whoami(ctx: HttpContext) {
    const clientIp = resolve_client_ip(ctx)
    return ctx.response.json(
      new SResponse({
        code: 0,
        message: '',
        data: {
          ip: clientIp.ip,
          category: clientIp.category,
          source: clientIp.source,
          reachable: clientIp.category === 'public',
          serverTime: Date.now(),
        },
      })
    )
  }
}