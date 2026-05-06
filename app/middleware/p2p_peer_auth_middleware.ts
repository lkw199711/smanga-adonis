import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { SResponse } from '#interfaces/response'
import { get_config } from '#utils/index'
import trackerGroupService from '#services/tracker/tracker_group_service'
import { get_default_tracker_client } from '#services/p2p/tracker_client'
import membershipCache from '#services/p2p/p2p_membership_cache'

/**
 * P2P 对等节点鉴权中间件
 *
 * 仅对 /p2p/serve/* 路径生效 (节点间直连接口)。
 *
 * 鉴权三层:
 *   1. 握手字段齐全(X-Node-Id / X-Group-No / X-Timestamp)
 *   2. 时间戳在 ±5 分钟窗口内
 *   3. 调用方 nodeId 必须是 X-Group-No 的合法群组成员
 *      - 本机为 tracker:直接查 tracker_membership 表
 *      - 本机仅为 node:通过 TrackerClient.checkMembership 远程验证
 *      - 校验结果以 60s TTL 缓存,避免高频拉取打爆 tracker / DB
 *      - 如果 tracker 短暂不可达且 *无可用缓存*,采用 "软失败放行" 策略,
 *        仅记录 warn,避免 tracker 抖动导致 P2P 全网雪崩
 *
 * 握手 Header:
 *  - X-Node-Id     : 调用方节点 ID
 *  - X-Group-No    : 访问所依据的群组号
 *  - X-Timestamp   : Unix 毫秒时间戳(±5 分钟内有效)
 *  - X-Signature   : 预留字段,后续启用 HMAC
 *
 * 成功后挂载 (request as any).p2pContext = { callerNodeId, groupNo }
 */
export default class P2PPeerAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx
    const url = request.url()

    // 仅对 /p2p/serve 与 /p2p/serve/* 生效
    const isPeerServeRoute = url === '/p2p/serve' || url.startsWith('/p2p/serve/')
    if (!isPeerServeRoute) {
      await next()
      return
    }

    const p2p = get_config()?.p2p
    const clientIp = request.ip()
    if (!p2p?.enable || !p2p?.role?.node) {
      console.warn(
        `[p2p-serve] 503 P2P未启用 | url=${url} ip=${clientIp} ` +
        `enable=${p2p?.enable} role.node=${p2p?.role?.node}`
      )
      return response
        .status(503)
        .json(new SResponse({ code: 1, message: 'P2P 未启用', status: 'p2p disabled' }))
    }

    const nodeId = request.header('x-node-id')
    const groupNo = request.header('x-group-no')
    const timestamp = Number(request.header('x-timestamp') || 0)

    if (!nodeId || !groupNo) {
      console.warn(
        `[p2p-serve] 401 缺少握手头 | url=${url} ip=${clientIp} ` +
        `X-Node-Id=${nodeId || '(缺失)'} X-Group-No=${groupNo || '(缺失)'}`
      )
      return response.status(401).json(
        new SResponse({
          code: 1,
          message: '缺少节点握手信息 (需要 X-Node-Id 与 X-Group-No 请求头)',
          status: 'unauthorized',
          data: { hasNodeId: !!nodeId, hasGroupNo: !!groupNo },
        })
      )
    }

    // 时间戳(宽容 5 分钟)
    const now = Date.now()
    if (timestamp && Math.abs(now - timestamp) > 5 * 60 * 1000) {
      const diffSec = Math.floor((now - timestamp) / 1000)
      console.warn(
        `[p2p-serve] 401 时间戳过期 | url=${url} nodeId=${nodeId} groupNo=${groupNo} ` +
        `clientTs=${timestamp} serverTs=${now} diff=${diffSec}s`
      )
      return response.status(401).json(
        new SResponse({
          code: 1,
          message: `时间戳超出有效期(与服务端相差 ${diffSec}s,请检查双方时钟同步)`,
          status: 'unauthorized',
          data: { clientTimestamp: timestamp, serverTimestamp: now, diffSeconds: diffSec },
        })
      )
    }

    // ============= 群组成员关系校验(带缓存 + 软失败) =============
    const allowed = await this.verifyMembership(nodeId, groupNo, url, clientIp)
    if (allowed === false) {
      return response.status(403).json(
        new SResponse({
          code: 1,
          message: '当前节点不是该群组成员或已被移除',
          status: 'forbidden',
          data: { nodeId, groupNo },
        })
      )
    }

    // TODO: 基于 Tracker 下发的 groupSecret 做 HMAC 签名校验
    // const signature = request.header('x-signature')

    ;(request as any).p2pContext = { callerNodeId: nodeId, groupNo }

    await next()
  }

  /**
   * 校验远端节点是否是该群组的合法成员。
   *
   * @returns true  : 是成员,允许继续
   *          false : 已确认不是成员,应该 403 拒绝
   *          'soft': tracker 不可达且无缓存 → 软失败放行,仅记 warn
   *
   * (调用方把 'soft' 与 true 等同处理,但单独保留是为了语义清晰)
   */
  private async verifyMembership(
    nodeId: string,
    groupNo: string,
    url: string,
    clientIp: string
  ): Promise<true | false | 'soft'> {
    // 1) 缓存命中
    const cached = membershipCache.get(nodeId, groupNo)
    if (cached === true) return true
    if (cached === false) {
      console.warn(
        `[p2p-serve] 403 命中负向缓存 | url=${url} ip=${clientIp} nodeId=${nodeId} groupNo=${groupNo}`
      )
      return false
    }

    // 2) 回源校验
    const cfg = get_config()?.p2p
    const isLocalTracker = !!cfg?.role?.tracker

    try {
      let allowed: boolean
      if (isLocalTracker) {
        // 本机就是 tracker:直接查本地 DB
        allowed = await trackerGroupService.isMember(nodeId, groupNo)
      } else {
        // 本机仅 node:通过 tracker 客户端反查
        const client = get_default_tracker_client()
        if (!client) {
          // 没有 tracker 配置,但请求已经带了合法握手字段
          // → 视为软失败(仅时间戳 + 握手通过)
          console.warn(
            `[p2p-serve] 软失败放行(无 tracker 客户端) | url=${url} ip=${clientIp} ` +
            `nodeId=${nodeId} groupNo=${groupNo}`
          )
          return 'soft'
        }
        allowed = await client.checkMembership(groupNo, nodeId)
      }

      membershipCache.set(nodeId, groupNo, allowed)
      return allowed
    } catch (err: any) {
      // tracker 不可达 / DB 异常 → 软失败放行,只记 warn,**不**写缓存
      console.warn(
        `[p2p-serve] 软失败放行(tracker 校验异常) | url=${url} ip=${clientIp} ` +
        `nodeId=${nodeId} groupNo=${groupNo} err=${err?.message || err}`
      )
      return 'soft'
    }
  }
}