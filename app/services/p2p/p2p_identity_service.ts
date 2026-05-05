/**
 * P2P 身份管理服务
 *
 * 职责:
 *  - 保证本节点拥有 nodeId / nodeToken(若无则自动向首选 Tracker 注册)
 *  - 注册成功后将 nodeId/nodeToken/nodeName 写回 smanga.json
 *  - 提供给其他服务统一的身份读取入口
 *
 * 注意:
 *  - nodeToken 仅首次注册由 Tracker 明文返回,之后仅持久化在本地配置;
 *    Tracker 侧只存 sha256(token),无法恢复。
 *  - 如果本机 role.tracker == true 且 trackers 为空/指向自身,则走 "本地直注册" 分支,
 *    直接写入 tracker_node 表,避免 HTTP 自调(此时后端可能尚未就绪)。
 */

import os from 'os'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { get_config, set_config } from '#utils/index'
import prisma from '#start/prisma'
import TrackerClient from './tracker_client.js'
import { log_p2p_error } from '#utils/p2p_log'

export type P2PIdentity = {
  nodeId: string
  nodeToken: string
  nodeName: string
}

/**
 * 解析节点本次运行对外的监听端口:
 * 优先读 process.env.PORT (AdonisJS 实际监听端口),否则回落 smanga.json 的 p2p.node.listenPort/lanPort
 * 保证 register/heartbeat 上报的端口与 HTTP serve 实际监听一致
 */
function resolveLocalPort(p2p: any): number | undefined {
  const envPort = Number(process.env.PORT)
  if (Number.isFinite(envPort) && envPort > 0) return envPort
  const cfgPort = p2p?.node?.listenPort || p2p?.node?.lanPort
  return cfgPort && cfgPort > 0 ? cfgPort : undefined
}

/**
 * 解析节点对外可达的 publicPort:
 * - 配置中明确指定了 publicPort(>0) 则用它(公网/反代场景)
 * - 否则回落到实际监听端口(同机/局域网场景足够)
 */
function resolvePublicPort(p2p: any): number | undefined {
  const cfgPub = p2p?.node?.publicPort
  if (cfgPub && cfgPub > 0) return cfgPub
  return resolveLocalPort(p2p)
}

/**
 * 解析节点对外可达 publicHost:
 * 仅当配置里填写了真实公网域名/IP 才上报;否则交给 tracker 用 request.ip()
 * (127.0.0.1 视为未配置,不上报以免污染 tracker)
 */
function resolvePublicHost(p2p: any): string | undefined {
  const h = p2p?.node?.publicHost
  if (!h || h === '127.0.0.1' || h === 'localhost' || h === '0.0.0.0') return undefined
  return h
}

class P2PIdentityService {
  /**
   * 获取身份;如缺失或已失效则自动(重新)注册
   * - 本机 tracker:直接落库
   * - 远端 tracker:HTTP 注册;若已有身份会先做一次心跳验证,无效则清身份重注册
   */
  async ensureIdentity(options: { forceReregister?: boolean } = {}): Promise<P2PIdentity | null> {
    const config = get_config()
    const p2p = config?.p2p
    if (!p2p?.enable) {
      console.warn('[p2p] ensureIdentity: 跳过 (smanga.json p2p.enable=false)')
      return null
    }
    if (!p2p?.role?.node) {
      console.warn('[p2p] ensureIdentity: 跳过 (smanga.json p2p.role.node=false)')
      return null
    }

    // 已存在且完整(且未强制重注册)
    if (!options.forceReregister && p2p.node?.nodeId && p2p.node?.nodeToken) {
      // 1) 若本机同时是 tracker,先校验本地 tracker_node 表是否真的存在该节点
      //    防止数据漂移:config 里有 nodeId 但数据库被重置/清空,导致后续所有
      //    /tracker/* 请求被中间件判为 "节点不存在"
      if (this.isLocalTracker(p2p)) {
        try {
          const exists = await prisma.tracker_node.findUnique({
            where: { nodeId: p2p.node.nodeId },
          })
          if (!exists) {
            console.warn(
              `[p2p] 检测到 config 中的 nodeId=${p2p.node.nodeId} 在 tracker_node 表中不存在,` +
              '正在用配置里的凭证补录一条记录(避免"节点不存在")'
            )
            await this.syncLocalTrackerNode(p2p)
          }
        } catch (e: any) {
          log_p2p_error('identity.syncLocalTrackerNode', e)
        }
      }

      // 2) 远端有效性验证:防止 tracker 数据库被清/更换 tracker 等场景
      const valid = await this.verifyIdentityOnTracker(p2p)
      if (valid) {
        return {
          nodeId: p2p.node.nodeId,
          nodeToken: p2p.node.nodeToken,
          nodeName: p2p.node.nodeName || '',
        }
      }

      // 3) 失效:清空本地身份后走下面的注册流程
      console.warn(
        `[p2p] 本地 nodeId=${p2p.node.nodeId} 在 tracker 端失效(可能被清库或换了 tracker),将自动重新注册`
      )
      this.clearLocalIdentity()
    }

    const nodeName = p2p.node?.nodeName || os.hostname() || 'smanga-node'

    // 1) 本机即 tracker 时,直接本地落库,不依赖 HTTP
    if (this.isLocalTracker(p2p)) {
      try {
        const identity = await this.registerLocally(nodeName, p2p)
        console.log(`[p2p] 本机 tracker,已本地直注册 nodeId=${identity.nodeId}`)
        return identity
      } catch (e: any) {
        log_p2p_error('identity.registerLocally', e)
        this.lastRegisterError = e
        return null
      }
    }

    // 2) 远端 tracker,走 HTTP 注册
    const trackerUrl = this.pickTrackerUrl(p2p)
    if (!trackerUrl) {
      console.warn(
        '[p2p] ensureIdentity 失败: 未配置 trackers 且本机非 tracker 角色\n' +
        '       请在 smanga.json 中设置 p2p.node.trackers = ["http://你的tracker地址:端口"]\n' +
        '       或将本机配置为 tracker (p2p.role.tracker=true)'
      )
      this.lastRegisterError = new Error('未配置 trackers 且本机非 tracker 角色')
      return null
    }

    console.log(`[p2p] ensureIdentity: 准备向远端 tracker 注册 url=${trackerUrl}`)
    const client = new TrackerClient(trackerUrl)
    try {
      const res = await client.register({
        nodeName,
        version: 'smanga-adonis',
        publicHost: resolvePublicHost(p2p),
        publicPort: resolvePublicPort(p2p),
        localHost: p2p.node?.lanHost || undefined,
        localPort: resolveLocalPort(p2p),
      })

      // 回写配置
      config.p2p.node.nodeId = res.nodeId
      config.p2p.node.nodeToken = res.nodeToken
      config.p2p.node.nodeName = nodeName
      if (res.publicHost) {
        config.p2p.node.publicHost = res.publicHost
      }
      set_config(config)

      console.log(`[p2p] 节点自动注册成功 nodeId=${res.nodeId} publicHost=${res.publicHost}`)
      return {
        nodeId: res.nodeId,
        nodeToken: res.nodeToken,
        nodeName,
      }
    } catch (e: any) {
      log_p2p_error(`identity.register(url=${trackerUrl})`, e)
      // 记录远端返回的 message(若有),否则用原始 error.message
      const remoteMsg: string | undefined = e?.response?.data?.message
      this.lastRegisterError = remoteMsg ? new Error(remoteMsg) : e
      // 给出明确的诊断建议
      if (e?.code === 'ECONNREFUSED' || e?.code === 'ENOTFOUND' || e?.code === 'ETIMEDOUT') {
        console.warn(
          '[p2p] 网络层连接失败提示:\n' +
          `       - 检查 tracker 地址 ${trackerUrl} 是否可达 (telnet / curl 测试)\n` +
          '       - 检查 tracker 服务是否已启动\n' +
          '       - 检查防火墙 / 端口映射'
        )
        this.lastRegisterError = new Error(`无法连接 tracker ${trackerUrl} (${e?.code})`)
      }
      return null
    }
  }

  /**
   * 校验本地 nodeId/nodeToken 在 tracker 端是否仍然有效
   * - 本机 tracker:查 tracker_node 表
   * - 远端 tracker:用 heartbeat 探测,401 视为失效;网络错误视为"暂时性",当作仍有效避免误清
   */
  private async verifyIdentityOnTracker(p2p: any): Promise<boolean> {
    const nodeId = p2p?.node?.nodeId
    const nodeToken = p2p?.node?.nodeToken
    if (!nodeId || !nodeToken) return false

    if (this.isLocalTracker(p2p)) {
      try {
        const node = await prisma.tracker_node.findUnique({ where: { nodeId } })
        if (!node) return false
        const tokenHash = crypto.createHash('sha256').update(nodeToken).digest('hex')
        return tokenHash === node.nodeToken
      } catch (e: any) {
        log_p2p_error('identity.verifyLocal', e)
        return true // 数据库异常时不清身份
      }
    }

    const url = this.pickTrackerUrl(p2p)
    if (!url) return true // 取不到 url 不当作失效
    try {
      const client = new TrackerClient(url, nodeId, nodeToken)
      await client.heartbeat({
        publicHost: resolvePublicHost(p2p),
        publicPort: resolvePublicPort(p2p),
        localHost: p2p?.node?.lanHost || undefined,
        localPort: resolveLocalPort(p2p),
      })
      return true
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 401 || status === 403) {
        return false
      }
      // 网络错误等暂时性问题:不当作失效,避免误清身份
      if (process.env.P2P_DEBUG) {
        console.warn(`[p2p] identity.verify 网络异常,保留身份 (status=${status} msg=${e?.message})`)
      }
      return true
    }
  }

  /**
   * 清空本地配置中的 nodeId / nodeToken,nodeName 保留
   */
  private clearLocalIdentity() {
    const config = get_config()
    if (config?.p2p?.node) {
      config.p2p.node.nodeId = ''
      config.p2p.node.nodeToken = ''
      set_config(config)
    }
  }

  /**
   * 主动作废本地身份并重新注册:供心跳/控制器在收到 401 / 节点不存在时调用
   * - 成功:返回新的身份
   * - 失败:抛出最近一次注册失败的原因(便于上层把详细错误透给前端)
   */
  async invalidateAndReregister(): Promise<P2PIdentity> {
    this.clearLocalIdentity()
    this.lastRegisterError = null
    const fresh = await this.ensureIdentity({ forceReregister: true })
    if (!fresh) {
      const reason = this.lastRegisterError?.message || this.lastRegisterError?.toString() || '未知原因'
      const err: any = new Error(`节点重新注册失败: ${reason}`)
      err.cause = this.lastRegisterError
      throw err
    }
    return fresh
  }

  /**
   * 最近一次注册过程中遇到的错误(由 ensureIdentity 内部记录,供 invalidateAndReregister 上抛)
   */
  private lastRegisterError: any = null

  /**
   * 读取当前身份(不触发注册)
   */
  getIdentity(): P2PIdentity | null {
    const p2p = get_config()?.p2p
    if (!p2p?.node?.nodeId || !p2p?.node?.nodeToken) return null
    return {
      nodeId: p2p.node.nodeId,
      nodeToken: p2p.node.nodeToken,
      nodeName: p2p.node.nodeName || '',
    }
  }

  /**
   * 判定当前配置下 tracker 是否就是本机:
   *  - role.tracker 必须为 true
   *  - 满足以下任一:
   *      a) node.trackers 为空
   *      b) node.trackers[0] host 指向 localhost / 127.0.0.1 / ::1
   *      c) node.trackers[0] 与 tracker.publicUrl 完全一致
   */
  private isLocalTracker(p2p: any): boolean {
    if (!p2p?.role?.tracker) return false

    const trackers: string[] = p2p?.node?.trackers || []
    if (trackers.length === 0) return true

    const first = trackers[0]
    const publicUrl: string = p2p?.tracker?.publicUrl || ''
    if (publicUrl && first.replace(/\/+$/, '') === publicUrl.replace(/\/+$/, '')) {
      return true
    }

    try {
      const u = new URL(first)
      const host = u.hostname
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
        return true
      }
    } catch {
      // 非法 URL 忽略
    }

    return false
  }

  /**
   * 本地直注册:自行生成 nodeId/rawToken,写入 tracker_node 表,并回写 smanga.json
   * 用于 "本机既是 node 又是 tracker" 的一体机场景,避免 HTTP 自调
   *
   * publicHost 决策:
   *  - 用户在 smanga.json 配置了 p2p.node.publicHost(且非 127.0.0.1) -> 直接采用
   *  - 否则置 null(留空),等节点首次心跳/外部请求时由 tracker 侧识别
   *    (一体机自连无法识别外部 IP,这一步交给后续真实远程心跳来填补)
   */
  private async registerLocally(nodeName: string, p2p: any): Promise<P2PIdentity> {
    const nodeId = uuidv4()
    const rawToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const port = resolveLocalPort(p2p) || null
    const cfgPublicHost = resolvePublicHost(p2p) // 已过滤掉 127.0.0.1 / localhost / 0.0.0.0

    if (!cfgPublicHost) {
      console.warn(
        '[p2p] 本地直注册:未配置 p2p.node.publicHost,publicHost 将先置空。\n' +
        '       如本机需要被外部节点访问,请在 smanga.json 设置:\n' +
        '         p2p.node.publicHost = "你的公网IP或域名"\n' +
        '         p2p.node.publicPort = 对外端口(NAT 后需做端口映射)'
      )
    }

    await prisma.tracker_node.create({
      data: {
        nodeId,
        nodeToken: tokenHash,
        nodeName: nodeName || null,
        publicHost: cfgPublicHost || null,
        publicPort: cfgPublicHost ? (resolvePublicPort(p2p) || port) : null,
        localHost: p2p?.node?.lanHost || '127.0.0.1',
        localPort: port,
        version: 'smanga-adonis',
        userAgent: 'local-init',
        online: 1,
        lastHeartbeat: new Date(),
      },
    })

    // 回写配置(仅 nodeId/nodeToken/nodeName,publicHost 不主动写入 127.0.0.1)
    const config = get_config()
    config.p2p.node.nodeId = nodeId
    config.p2p.node.nodeToken = rawToken
    config.p2p.node.nodeName = nodeName
    set_config(config)

    return { nodeId, nodeToken: rawToken, nodeName }
  }

  /**
   * 一体机自愈:当 config 中有 nodeId/nodeToken,但 tracker_node 表没有对应记录时,
   * 用配置里的 rawToken 计算 hash 并补录一条 tracker_node 记录。
   * 这样后续 /tracker/* 请求的 X-Node-Id/X-Node-Token 鉴权就能通过。
   */
  private async syncLocalTrackerNode(p2p: any): Promise<void> {
    const nodeId: string = p2p?.node?.nodeId
    const rawToken: string = p2p?.node?.nodeToken
    if (!nodeId || !rawToken) return

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const port = resolveLocalPort(p2p) || null
    const cfgPublicHost = resolvePublicHost(p2p)

    await prisma.tracker_node.upsert({
      where: { nodeId },
      update: {
        // 仅更新必要字段,避免覆盖人工修改
        nodeToken: tokenHash,
        online: 1,
        lastHeartbeat: new Date(),
        // 同机自愈时强制刷新端口,保证 seeds 能拼出正确 baseUrl
        ...(port !== null && { localPort: port }),
        ...(port !== null && { publicPort: resolvePublicPort(p2p) || port }),
      },
      create: {
        nodeId,
        nodeToken: tokenHash,
        nodeName: p2p?.node?.nodeName || null,
        // 仅当配置里显式给了真实公网 host(非 127.0.0.1)才入库,避免污染
        publicHost: cfgPublicHost || null,
        publicPort: cfgPublicHost ? (resolvePublicPort(p2p) || port) : null,
        localHost: p2p?.node?.lanHost || '127.0.0.1',
        localPort: port,
        version: 'smanga-adonis',
        userAgent: 'local-sync',
        online: 1,
        lastHeartbeat: new Date(),
      },
    })

    console.log(`[p2p] 已补录 tracker_node 记录 nodeId=${nodeId}`)
  }

  /**
   * 选择 tracker url:
   *  1. 节点配置的 trackers[0]
   *  2. 若自身是 tracker 角色,且 publicUrl 非空则使用
   *  3. 若自身是 tracker 且均为空,则尝试 http://127.0.0.1:{主服务端口}
   */
  pickTrackerUrl(p2p: any): string | null {
    const trackers: string[] = p2p?.node?.trackers || []
    if (trackers.length > 0) return trackers[0]

    if (p2p?.role?.tracker) {
      const publicUrl = p2p?.tracker?.publicUrl
      if (publicUrl) return publicUrl
      // 回落到本地主服务(AdonisJS 默认端口,通过 .env PORT 获取)
      const port = process.env.PORT || 3000
      return `http://127.0.0.1:${port}`
    }

    return null
  }
}

export default new P2PIdentityService()