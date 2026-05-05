import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import prisma from '#start/prisma'
import { SResponse } from '#interfaces/response'
import { get_config } from '#utils/index'
import crypto from 'crypto'

/**
 * Tracker 鉴权中间件
 * - 放行 /tracker/node/register (公开接口)
 * - 其他接口要求 Header: X-Node-Id + X-Node-Token
 * - 命中后将 trackerNode 挂到 request 上,供控制器使用
 */
export default class TrackerAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx

    const url = request.url()

    // 仅对 /tracker 与 /tracker/* 路径生效,其余直接放行 (避免误匹配 /trackerxxx)
    const isTrackerRoute = url === '/tracker' || url.startsWith('/tracker/')
    if (!isTrackerRoute) {
      await next()
      return
    }

    // 总开关校验
    const p2p = get_config()?.p2p
    if (!p2p?.enable || !p2p?.role?.tracker) {
      return response
        .status(503)
        .json(new SResponse({ code: 1, message: 'Tracker 未启用', status: 'tracker disabled' }))
    }

    // 公开访问的接口白名单(精确匹配,避免前缀误伤)
    //   - /tracker/node/register: 节点注册(首次)
    //   - /tracker/node/whoami:   客户端网络可达性自检(返回 tracker 视角看到的 IP)
    if (url === '/tracker/node/register' || url === '/tracker/node/whoami') {
      await next()
      return
    }

    const nodeId = request.header('x-node-id')
    const nodeToken = request.header('x-node-token')

    if (!nodeId || !nodeToken) {
      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '缺少节点鉴权信息', status: 'unauthorized' }))
    }

    const node = await prisma.tracker_node.findUnique({ where: { nodeId } })

    if (!node) {
      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '节点不存在', status: 'unauthorized' }))
    }

    if (node.banned === 1) {
      return response.status(403).json(
        new SResponse({
          code: 1,
          message: '节点已被封禁: ' + (node.bannedReason || ''),
          status: 'banned',
        })
      )
    }

    // 校验 token hash
    const tokenHash = crypto.createHash('sha256').update(nodeToken).digest('hex')
    if (tokenHash !== node.nodeToken) {
      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '节点令牌无效', status: 'unauthorized' }))
    }

    // 挂载节点上下文
    ;(request as any).trackerNode = node
    ;(request as any).trackerNodeId = nodeId

    await next()
  }
}