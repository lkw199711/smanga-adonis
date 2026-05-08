/**
 * Tracker 节点反向可达性验证服务
 *
 * 工作流(简化版):
 *  1. register / heartbeat 时 tracker 直接拿到节点自报的 publicUrl
 *     (经 normalize_public_url 规范化:补 http://、去尾斜杠)
 *  2. tracker 生成一次性 challenge(16 字节 hex)
 *  3. tracker 主动 GET {publicUrl}/p2p/verify/echo?challenge=xxx
 *     - 拼接通过 join_url_path 完成,保证不会出现双斜杠
 *  4. 节点回显 challenge -> tracker 比对 -> 一致即视为"真实可达的公网端点"
 *
 * 失败场景统一视为不可达:
 *  - 连接超时 / 拒绝 / DNS 失败 (ECONNREFUSED / ETIMEDOUT / ENOTFOUND)
 *  - HTTP 非 200
 *  - 响应 JSON 无 challenge 或 challenge 不匹配
 *  - 带 expectNodeId 时,peer 返回的 nodeId 不一致
 *
 * 本项目定位为公网 P2P,不做 NAT 内网穿透;验证失败的节点将被拒绝注册 / 标记下线。
 */

import axios from 'axios'
import crypto from 'crypto'
import {
  is_reportable_public_url,
  join_url_path,
  normalize_public_url,
} from '#utils/ip_resolver'

export type VerifyReachableParams = {
  /**
   * 节点完整 baseUrl: "http(s)://host[:port][/pathPrefix]"
   * 例如: http://1.2.3.4:9798 (后端直连)
   *      http://1.2.3.4:9797/api (经 webui 反代)
   * 探测时会在该 baseUrl 后拼接 /p2p/verify/echo
   */
  baseUrl: string
  /** 节点已分配的 nodeId;若提供,peer 返回的 nodeId 必须一致 */
  expectNodeId?: string
  /** 可选:单次请求超时毫秒(默认 5000) */
  timeoutMs?: number
}

export type VerifyReachableResult = {
  ok: boolean
  /** 明细原因,便于日志/报错透出 */
  reason?: string
  /** 实际验证耗时 */
  elapsedMs: number
  /** peer 回包里的 nodeId(若有) */
  peerNodeId?: string
}

class TrackerReachabilityService {
  /**
   * 反向验证节点 baseUrl 是否真实可达
   * 拼接 {baseUrl}/p2p/verify/echo 做 challenge-response 验证
   */
  async verify(params: VerifyReachableParams): Promise<VerifyReachableResult> {
    const started = Date.now()
    const { baseUrl, expectNodeId } = params
    const timeoutMs = params.timeoutMs ?? 5000

    // 信任客户端 url:仅做 normalize + host 合法性校验
    if (!is_reportable_public_url(baseUrl)) {
      return {
        ok: false,
        reason: `baseUrl 非法或为本地地址: ${baseUrl}`,
        elapsedMs: Date.now() - started,
      }
    }
    const normalizedBase = normalize_public_url(baseUrl)

    const challenge = crypto.randomBytes(16).toString('hex')
    // 用 join_url_path 拼接,避免 baseUrl 末尾 / 与 subPath 起始 / 重复
    const url = join_url_path(normalizedBase, '/p2p/verify/echo')
    try {
      const resp = await axios.get(url, {
        params: { challenge, nodeId: expectNodeId || '' },
        timeout: timeoutMs,
        // 不自动跟随过多跳转(P2P 节点不该有重定向)
        maxRedirects: 0,
        // 故意不带任何 tracker 自己的鉴权 header,避免 peer 误以为是它自己的客户端
        validateStatus: (s) => s >= 200 && s < 300,
      })

      const body = resp?.data
      // SResponse 结构:{ code, message, data: { challenge, nodeId, ... } }
      if (!body || body.code !== 0 || !body.data) {
        return {
          ok: false,
          reason: `peer 响应格式异常: code=${body?.code} message=${body?.message}`,
          elapsedMs: Date.now() - started,
        }
      }
      const data = body.data
      if (data.challenge !== challenge) {
        return {
          ok: false,
          reason: `challenge 不匹配: expected=${challenge.slice(0, 8)}.. got=${String(data.challenge || '').slice(0, 8)}..`,
          elapsedMs: Date.now() - started,
        }
      }

      // 心跳阶段若带了 expectNodeId,则 peer 必须回同样的 nodeId
      if (expectNodeId && data.nodeId && data.nodeId !== expectNodeId) {
        return {
          ok: false,
          reason: `nodeId 不一致: expected=${expectNodeId} peer=${data.nodeId}`,
          elapsedMs: Date.now() - started,
          peerNodeId: data.nodeId,
        }
      }

      return {
        ok: true,
        elapsedMs: Date.now() - started,
        peerNodeId: data.nodeId || undefined,
      }
    } catch (err: any) {
      const code = err?.code
      const status = err?.response?.status
      let reason: string
      if (status) {
        reason = `HTTP ${status} (${err?.response?.statusText || ''}) ${url}`
      } else if (code === 'ECONNREFUSED') {
        reason = `连接被拒绝 (端口未开放或服务未运行): ${url}`
      } else if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
        reason = `连接超时 (>${timeoutMs}ms): ${url}`
      } else if (code === 'ENOTFOUND') {
        reason = `域名解析失败: ${url}`
      } else if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
        reason = `网络不可达: ${url}`
      } else {
        reason = `${code || 'unknown'}: ${err?.message}`
      }
      return { ok: false, reason, elapsedMs: Date.now() - started }
    }
  }
}

export default new TrackerReachabilityService()