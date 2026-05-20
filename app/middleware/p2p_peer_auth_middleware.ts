import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { SResponse } from '#interfaces/response'
import { get_config } from '#utils/index'
import trackerGroupService from '#services/tracker/tracker_group_service'
import { get_default_tracker_client } from '#services/p2p/tracker_client'
import membershipCache from '#services/p2p/p2p_membership_cache'
import log from '#services/log_service'

export default class P2PPeerAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx
    const url = request.url()

    const isPeerServeRoute = url === '/p2p/serve' || url.startsWith('/p2p/serve/')
    if (!isPeerServeRoute) {
      await next()
      return
    }

    const p2p = get_config()?.p2p
    const clientIp = request.ip()

    const device = {
      requestId: request.id?.(),
      ip: clientIp,
      userAgent: request.header('user-agent'),
      method: request.method(),
      url,
    }

    if (!p2p?.enable || !p2p?.role?.node) {
      await log.warn({
        type: 'security',
        module: 'p2p',
        action: 'p2p.auth.failed',
        message: 'p2p peer auth failed: p2p disabled',
        context: {
          reason: 'p2p_disabled',
          enable: p2p?.enable,
          roleNode: p2p?.role?.node,
        },
        device,
      })

      return response
        .status(503)
        .json(new SResponse({ code: 1, message: 'P2P 未启用', status: 'p2p disabled' }))
    }

    const nodeId = request.header('x-node-id')
    const groupNo = request.header('x-group-no')
    const timestamp = Number(request.header('x-timestamp') || 0)

    if (!nodeId || !groupNo) {
      await log.warn({
        type: 'security',
        module: 'p2p',
        action: 'p2p.auth.failed',
        message: 'p2p peer auth failed: missing headers',
        context: {
          reason: 'missing_handshake_headers',
          hasNodeId: !!nodeId,
          hasGroupNo: !!groupNo,
        },
        device,
      })

      return response.status(401).json(
        new SResponse({
          code: 1,
          message: '缺少节点握手信息 (X-Node-Id / X-Group-No)',
          status: 'unauthorized',
          data: { hasNodeId: !!nodeId, hasGroupNo: !!groupNo },
        })
      )
    }

    const now = Date.now()
    if (timestamp && Math.abs(now - timestamp) > 5 * 60 * 1000) {
      const diffSec = Math.floor((now - timestamp) / 1000)

      await log.warn({
        type: 'security',
        module: 'p2p',
        action: 'p2p.auth.failed',
        message: 'p2p peer auth failed: timestamp expired',
        context: {
          reason: 'timestamp_expired',
          nodeId,
          groupNo,
          clientTimestamp: timestamp,
          serverTimestamp: now,
          diffSeconds: diffSec,
        },
        device,
      })

      return response.status(401).json(
        new SResponse({
          code: 1,
          message: `时间戳超过有效期(与服务端相差 ${diffSec}s)`,
          status: 'unauthorized',
          data: { clientTimestamp: timestamp, serverTimestamp: now, diffSeconds: diffSec },
        })
      )
    }

    const allowed = await this.verifyMembership(nodeId, groupNo, url, clientIp)
    if (allowed === false) {
      await log.warn({
        type: 'security',
        module: 'p2p',
        action: 'p2p.auth.failed',
        message: 'p2p peer auth failed: node is not a member',
        context: {
          reason: 'membership_denied',
          nodeId,
          groupNo,
        },
        device,
      })

      return response.status(403).json(
        new SResponse({
          code: 1,
          message: '当前节点不是该群组成员或已被移除',
          status: 'forbidden',
          data: { nodeId, groupNo },
        })
      )
    }

    ;(request as any).p2pContext = { callerNodeId: nodeId, groupNo }

    await next()
  }

  private async verifyMembership(
    nodeId: string,
    groupNo: string,
    url: string,
    clientIp: string
  ): Promise<true | false | 'soft'> {
    const cached = membershipCache.get(nodeId, groupNo)
    if (cached === true) return true
    if (cached === false) {
      void log.warn({
        type: 'security',
        module: 'p2p',
        action: 'p2p.membership.denied_cache_hit',
        message: `[p2p-serve] 403 negative cache hit | url=${url} ip=${clientIp} nodeId=${nodeId} groupNo=${groupNo}`,
        context: { url, clientIp, nodeId, groupNo },
      })
      return false
    }

    const cfg = get_config()?.p2p
    const isLocalTracker = !!cfg?.role?.tracker

    try {
      let allowed: boolean
      if (isLocalTracker) {
        allowed = await trackerGroupService.isMember(nodeId, groupNo)
      } else {
        const client = get_default_tracker_client()
        if (!client) {
          void log.warn({
            type: 'security',
            module: 'p2p',
            action: 'p2p.membership.soft_pass.client_missing',
            message: `[p2p-serve] soft pass, tracker client missing | url=${url} ip=${clientIp} nodeId=${nodeId} groupNo=${groupNo}`,
            context: { url, clientIp, nodeId, groupNo },
          })
          return 'soft'
        }
        allowed = await client.checkMembership(groupNo, nodeId)
      }

      membershipCache.set(nodeId, groupNo, allowed)
      return allowed
    } catch (err: any) {
      void log.warn({
        type: 'security',
        module: 'p2p',
        action: 'p2p.membership.soft_pass.verify_error',
        message: `[p2p-serve] soft pass, tracker verify error | url=${url} ip=${clientIp} nodeId=${nodeId} groupNo=${groupNo} err=${err?.message || err}`,
        error: err,
        context: { url, clientIp, nodeId, groupNo },
      })
      return 'soft'
    }
  }
}
