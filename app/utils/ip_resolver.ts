/**
 * 客户端真实 IP 解析 + 公私网判定工具
 *
 * 适用场景:
 *  - Tracker 接收节点 register/heartbeat 时,需要识别节点的真实公网地址
 *  - 节点部署形态多样:本机、局域网、公网直连、反向代理后、CDN 后
 *
 * 工作原理:
 *  1. 优先读取常见反代头 X-Forwarded-For / X-Real-IP / CF-Connecting-IP
 *  2. 回落到 request.ip()(socket.remoteAddress)
 *  3. 规范化 IPv6 映射(::ffff:1.2.3.4 -> 1.2.3.4)
 *  4. 分类:loopback / private(RFC1918+CGNAT+link-local) / public / invalid
 *
 * 注意:
 *  - Tracker 直接公网部署时,X-Forwarded-For 不可信,默认不使用,除非 trust_proxy_hops 配置
 *  - 节点自报的 publicHost 也要经过同样的过滤,避免 127.0.0.1 误入库
 */

import type { HttpContext } from '@adonisjs/core/http'

export type IpCategory = 'loopback' | 'private' | 'public' | 'invalid'

export type ResolveIpResult = {
  ip: string
  category: IpCategory
  /** 从哪个字段解析得到:header 名字或 'socket' */
  source: string
}

/**
 * 把 IPv4 点分字符串转成 32 位无符号整数,失败返回 NaN
 */
function ipv4_to_int(ip: string): number {
  const parts = ip.split('.')
  if (parts.length !== 4) return NaN
  let n = 0
  for (const p of parts) {
    const v = Number(p)
    if (!Number.isInteger(v) || v < 0 || v > 255) return NaN
    n = n * 256 + v
  }
  return n >>> 0
}

/**
 * 规范化 IP 字符串
 *  - 去空白
 *  - IPv6 映射的 IPv4(::ffff:a.b.c.d) -> a.b.c.d
 *  - ::1 保留
 */
export function normalize_ip(raw: string | undefined | null): string {
  if (!raw) return ''
  let ip = String(raw).trim()
  // 去除可能的端口(形如 1.2.3.4:5678, 但要避免误伤 IPv6)
  if (ip.includes('.') && ip.includes(':') && !ip.includes('::') && ip.split(':').length === 2) {
    ip = ip.split(':')[0]
  }
  // IPv6 映射 IPv4
  const m = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (m) return m[1]
  return ip
}

/**
 * 判定 IP 属于哪个类别:
 *  - loopback: 127.0.0.0/8, ::1
 *  - private:  10/8, 172.16/12, 192.168/16, 100.64/10(CGNAT), 169.254/16(link-local),
 *              0.0.0.0/8, fc00::/7, fe80::/10
 *  - public:   其它有效 IP
 *  - invalid:  不可解析
 */
export function classify_ip(rawIp: string | undefined | null): IpCategory {
  const ip = normalize_ip(rawIp)
  if (!ip) return 'invalid'

  // IPv6 常见情况
  if (ip === '::1') return 'loopback'
  if (/^fe80:/i.test(ip)) return 'private'       // link-local
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(ip)) return 'private' // unique local fc00::/7
  if (ip === '::' || ip === '0:0:0:0:0:0:0:0') return 'invalid'

  // IPv4
  const n = ipv4_to_int(ip)
  if (!Number.isFinite(n)) {
    // 不是 IPv4 也不是已知 IPv6 特例,但是字符串里含有 ':' 则按公网 IPv6 看待
    if (ip.includes(':')) return 'public'
    return 'invalid'
  }

  // 127.0.0.0/8
  if ((n >>> 24) === 127) return 'loopback'
  // 0.0.0.0/8
  if ((n >>> 24) === 0) return 'invalid'
  // 10.0.0.0/8
  if ((n >>> 24) === 10) return 'private'
  // 172.16.0.0/12
  if ((n >>> 20) === (172 * 16 + 1)) return 'private'
  // 192.168.0.0/16
  if ((n >>> 16) === (192 * 256 + 168)) return 'private'
  // 169.254.0.0/16 (link-local)
  if ((n >>> 16) === (169 * 256 + 254)) return 'private'
  // 100.64.0.0/10 (CGNAT,运营商大内网)
  if ((n >>> 22) === ((100 * 256 + 64) >>> 6)) return 'private'

  return 'public'
}

/** 便捷 helper:是否公网可达 */
export function is_public_ip(ip: string | undefined | null): boolean {
  return classify_ip(ip) === 'public'
}

/**
 * 从 HTTP 请求中解析客户端真实 IP
 *
 * 策略:
 *  - 优先尝试反向代理头(按顺序):
 *      1) X-Forwarded-For   (取最左非私网/回环 IP;若全是私网,取最右)
 *      2) X-Real-IP
 *      3) CF-Connecting-IP  (Cloudflare)
 *      4) True-Client-IP    (Akamai/CDN)
 *  - 若以上均为空或无效,使用 request.ip() (= socket.remoteAddress)
 */
export function resolve_client_ip(ctx: HttpContext): ResolveIpResult {
  const { request } = ctx

  const headerCandidates: Array<[string, string]> = [
    ['x-forwarded-for', request.header('x-forwarded-for') || ''],
    ['x-real-ip', request.header('x-real-ip') || ''],
    ['cf-connecting-ip', request.header('cf-connecting-ip') || ''],
    ['true-client-ip', request.header('true-client-ip') || ''],
  ]

  for (const [name, rawValue] of headerCandidates) {
    if (!rawValue) continue
    // X-Forwarded-For 可能是 "client, proxy1, proxy2",取最左侧非私网
    const parts = String(rawValue)
      .split(',')
      .map((s) => normalize_ip(s))
      .filter(Boolean)
    if (!parts.length) continue

    // 优先选第一个公网 IP
    const publicIp = parts.find((p) => classify_ip(p) === 'public')
    if (publicIp) return { ip: publicIp, category: 'public', source: name }

    // 否则退而求其次:挑第一个非 invalid
    const firstValid = parts.find((p) => classify_ip(p) !== 'invalid')
    if (firstValid) return { ip: firstValid, category: classify_ip(firstValid), source: name }
  }

  const socketIp = normalize_ip(request.ip())
  return { ip: socketIp, category: classify_ip(socketIp), source: 'socket' }
}

/**
 * 节点自报的 publicHost 是否值得入库
 *  - 空串/undefined:不入库
 *  - 127.0.0.1 / localhost / 0.0.0.0 / ::1:不入库(脏数据)
 *  - 其它(IP 或域名):入库(域名交给调用方解析,这里不做 DNS)
 */
export function is_reportable_public_host(host: string | undefined | null): boolean {
  if (!host) return false
  const h = String(host).trim().toLowerCase()
  if (!h) return false
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' || h === '::') {
    return false
  }
  return true
}