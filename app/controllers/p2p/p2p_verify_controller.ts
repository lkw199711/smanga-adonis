/**
 * P2P 节点公网可达性反向验证接口
 *
 * 用途:
 *  - 节点向 tracker 发起 register/heartbeat 时,tracker 会主动反向 GET 本接口
 *  - tracker 校验返回内容里的 challenge 是否与发送的一致 -> 确认节点 publicUrl 真实可达
 *
 * 设计要点:
 *  - 路径 /p2p/verify/echo 与 /p2p/serve/* 隔离,不走 P2PPeerAuthMiddleware
 *    (注册阶段调用方 tracker 还没有 X-Group-No 上下文)
 *  - 接口无状态,只把请求里的 challenge / nodeId 原样回显
 *  - 不暴露任何敏感信息,仅证明"这个端口的进程是 smanga-adonis 节点"
 *  - 仅当 p2p.enable && role.node 为 true 时启用,否则返回 503
 */

import type { HttpContext } from '@adonisjs/core/http'
import { get_config } from '#utils/index'
import { log_p2p_error, log_p2p_info } from '#utils/p2p_log'
import { p2pVerifyEchoValidator } from '#validators/p2p'

export default class P2PVerifyController {
  /**
   * GET /p2p/verify/echo?challenge=xxx&nodeId=yyy
   *
   * 入参(query):
   *  - challenge:  tracker 下发的随机串(必填)
   *  - nodeId:     若节点已分配 nodeId,可附带让 tracker 双重校验(可选)
   *
   * 出参:
   *  - challenge:  原样回显
   *  - nodeId:     若本节点配置中已有 nodeId,带上(便于 tracker 在心跳验证时核对)
   *  - serverTime: 当前 unix ms
   *  - version:    服务标识字符串
   */
  async echo({ request, response }: HttpContext) {
    try {
      const p2p = get_config()?.p2p
      if (!p2p?.enable || !p2p?.role?.node) {
        return response.status(503).json({ code: 503, message: 'P2P 未启用', status: 'p2p disabled' })
      }

      const { challenge } = await p2pVerifyEchoValidator.validate(request.qs())

      const localNodeId: string = p2p?.node?.nodeId || ''
      log_p2p_info('verify.echo', {
        nodeId: localNodeId || null,
        challengeLength: String(challenge || '').length,
      })

      return response.json({
        code: 200,
        message: 'ok',
        data: { challenge, nodeId: localNodeId, serverTime: Date.now(), version: 'smanga-adonis' },
      })
    } catch (err: any) {
      log_p2p_error('verify.echo', err)
      return response.status(500).json({ code: 500, message: err?.message || 'verify failed' })
    }
  }
}
