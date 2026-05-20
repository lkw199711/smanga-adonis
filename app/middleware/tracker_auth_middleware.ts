import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import prisma from '#start/prisma'
import { SResponse } from '#interfaces/response'
import { get_config } from '#utils/index'
import crypto from 'crypto'
import log from '#services/log_service'

export default class TrackerAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx

    const url = request.url()
    const isTrackerRoute = url === '/tracker' || url.startsWith('/tracker/')
    if (!isTrackerRoute) {
      await next()
      return
    }

    const device = {
      requestId: request.id?.(),
      ip: request.ip(),
      userAgent: request.header('user-agent'),
      method: request.method(),
      url,
    }

    const p2p = get_config()?.p2p
    if (!p2p?.enable || !p2p?.role?.tracker) {
      await log.warn({
        type: 'security',
        module: 'tracker',
        action: 'tracker.auth.failed',
        message: 'tracker auth failed: tracker disabled',
        context: {
          reason: 'tracker_disabled',
        },
        device,
      })

      return response
        .status(503)
        .json(new SResponse({ code: 1, message: 'Tracker 未启用', status: 'tracker disabled' }))
    }

    if (url === '/tracker/node/register' || url === '/tracker/node/whoami') {
      await next()
      return
    }

    const nodeId = request.header('x-node-id')
    const nodeToken = request.header('x-node-token')

    if (!nodeId || !nodeToken) {
      await log.warn({
        type: 'security',
        module: 'tracker',
        action: 'tracker.auth.failed',
        message: 'tracker auth failed: missing headers',
        context: {
          reason: 'missing_headers',
          hasNodeId: !!nodeId,
          hasNodeToken: !!nodeToken,
        },
        device,
      })

      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '缺少节点鉴权信息', status: 'unauthorized' }))
    }

    const node = await prisma.tracker_node.findUnique({ where: { nodeId } })

    if (!node) {
      await log.warn({
        type: 'security',
        module: 'tracker',
        action: 'tracker.auth.failed',
        message: 'tracker auth failed: node not found',
        context: {
          reason: 'node_not_found',
          nodeId,
        },
        device,
      })

      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '节点不存在', status: 'unauthorized' }))
    }

    if (node.banned === 1) {
      await log.warn({
        type: 'security',
        module: 'tracker',
        action: 'tracker.auth.failed',
        message: 'tracker auth failed: node banned',
        context: {
          reason: 'node_banned',
          nodeId,
          bannedReason: node.bannedReason,
        },
        device,
      })

      return response.status(403).json(
        new SResponse({
          code: 1,
          message: '节点已被封禁: ' + (node.bannedReason || ''),
          status: 'banned',
        })
      )
    }

    const isHeartbeat = url === '/tracker/node/heartbeat'
    if (node.online !== 1 && !isHeartbeat) {
      await log.warn({
        type: 'security',
        module: 'tracker',
        action: 'tracker.auth.failed',
        message: 'tracker auth failed: node offline',
        context: {
          reason: 'node_offline',
          nodeId,
        },
        device,
      })

      return response.status(403).json(
        new SResponse({
          code: 1,
          message: '节点离线，不允许操作',
          status: 'offline',
        })
      )
    }

    const tokenHash = crypto.createHash('sha256').update(nodeToken).digest('hex')
    if (tokenHash !== node.nodeToken) {
      await log.warn({
        type: 'security',
        module: 'tracker',
        action: 'tracker.auth.failed',
        message: 'tracker auth failed: invalid token',
        context: {
          reason: 'invalid_token',
          nodeId,
          token: nodeToken,
        },
        device,
      })

      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '节点令牌无效', status: 'unauthorized' }))
    }

    ;(request as any).trackerNode = node
    ;(request as any).trackerNodeId = nodeId

    await next()
  }
}