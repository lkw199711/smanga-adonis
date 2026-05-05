import type { HttpContext } from '@adonisjs/core/http'
import { SResponse } from '#interfaces/response'
import trackerNodeService from '#services/tracker/tracker_node_service'
import { log_tracker_error } from '#utils/p2p_log'
import { resolve_client_ip } from '#utils/ip_resolver'

/**
 * Tracker 节点生命周期接口
 * 路由: /tracker/node/*
 */
export default class TrackerNodesController {
  /**
   * POST /tracker/node/register
   *
   * publicHost 策略:
   *  - 节点自报(payload.publicHost)优先,但必须是"有效非本地"host,否则忽略
   *  - 其次由 tracker 侧通过 request 头链解析客户端真实 IP(resolve_client_ip)
   *  - 最后结果会做公/私网分类记录进 node 表
   *
   * publicPort:
   *  - 必须节点自报(tracker 无法从入站 TCP 连接推导出节点的对外服务端口)
   */
  async register(ctx: HttpContext) {
    const { request, response } = ctx
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
      const payload = request.only(['publicHost', 'publicPort', 'localHost', 'localPort'])
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