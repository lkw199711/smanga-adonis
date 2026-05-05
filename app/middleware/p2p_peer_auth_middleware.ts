import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { SResponse } from '#interfaces/response'
import { get_config } from '#utils/index'

/**
 * P2P 对等节点鉴权中间件 (轻量版)
 *
 * 仅对 /p2p/serve/* 路径生效 (节点间直连接口)。
 *
 * 设计前提:
 *  - 共享/群组关系的权威方是 Tracker 服务器,节点之间不做本地数据库校验
 *  - 本中间件只做"握手字段是否齐全 + 时间戳是否在允许窗口内"两层基础校验
 *  - 真正的 "调用方是否有权访问此资源" 由 Tracker 在颁发 group/share 信息时统一管理
 *
 * 握手字段(HTTP Header):
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

    // TODO: 基于 Tracker 下发的 groupSecret 做 HMAC 签名校验
    // const signature = request.header('x-signature')

    ;(request as any).p2pContext = { callerNodeId: nodeId, groupNo }

    await next()
  }
}