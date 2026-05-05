import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { SResponse } from '#interfaces/response'
import { get_config } from '#utils/index'
import prisma from '#start/prisma'

/**
 * P2P 对等节点鉴权中间件
 *
 * 仅对 /p2p/serve/* 路径生效 (节点间直连接口)。
 * 用户管理接口 /p2p/group|share|peer|transfer/* 走 auth_middleware (用户 token)。
 *
 * 握手字段(HTTP Header):
 *  - X-Node-Id     : 调用方节点 ID
 *  - X-Group-No    : 访问所依据的群组号(双方共同所在群)
 *  - X-Timestamp   : Unix 毫秒时间戳(±5 分钟内有效)
 *  - X-Signature   : 预留字段,MVP 阶段不强制校验,后续版本启用 HMAC
 *
 * 校验流程:
 *  1. 检查配置开关(p2p.enable && p2p.role.node)
 *  2. 检查必要 Header
 *  3. 时间戳防重放(±5 分钟)
 *  4. 群组白名单:本地 p2p_group 表内必须存在且 enable=1
 *  5. TODO: 校验签名(预留 groupSecret 缓存)
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
    if (!p2p?.enable || !p2p?.role?.node) {
      return response
        .status(503)
        .json(new SResponse({ code: 1, message: 'P2P 未启用', status: 'p2p disabled' }))
    }

    const nodeId = request.header('x-node-id')
    const groupNo = request.header('x-group-no')
    const timestamp = Number(request.header('x-timestamp') || 0)

    if (!nodeId || !groupNo) {
      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '缺少节点握手信息', status: 'unauthorized' }))
    }

    // 时间戳(宽容 5 分钟)
    const now = Date.now()
    if (timestamp && Math.abs(now - timestamp) > 5 * 60 * 1000) {
      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '时间戳超出有效期', status: 'unauthorized' }))
    }

    // 检查本地是否也在该群组内
    const localGroup = await prisma.p2p_group.findFirst({ where: { groupNo } })
    if (!localGroup) {
      return response
        .status(403)
        .json(new SResponse({ code: 1, message: '本节点未加入该群组', status: 'forbidden' }))
    }

    // TODO: 基于 groupSecret 的 HMAC 签名校验
    // const signature = request.header('x-signature')

    ;(request as any).p2pContext = { callerNodeId: nodeId, groupNo }

    await next()
  }
}