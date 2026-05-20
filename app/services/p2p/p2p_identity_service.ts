/**
 * P2P 身份管理服务
 *
 * 职责:
 *  - 保证本节点拥有 nodeId / nodeToken(若无则自动向首选 Tracker 注册)
 *  - 注册成功后将 nodeId/nodeToken/nodeName 写回 smanga.json
 *  - 提供给其他服务统一的身份读取入口
 *
 * publicUrl 语义(重构后):
 *  - 完全由用户在 smanga.json 的 p2p.node.publicUrl 配置,节点/tracker 不再做端口拆分/替换
 *  - 仅在上报时做一次规范化(补 http:// 前缀、去尾部斜杠)
 *  - tracker 侧也直接信任这个 URL,不再拼接 localHost/localPort
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
import { log_p2p_error, log_p2p_info } from '#utils/p2p_log'
import { normalize_public_url, is_reportable_public_url } from '#utils/ip_resolver'

export type P2PIdentity = {
  nodeId: string
  nodeToken: string
  nodeName: string
}

/**
 * 解析节点对外可达 publicUrl:
 *  - 取 smanga.json 的 p2p.node.publicUrl 原值
 *  - 仅做 normalize_public_url(补 http://、去尾部斜杠)
 *  - host 为 loopback / 空 -> 返回 undefined(不入库)
 */
function resolvePublicUrl(p2p: any): string | undefined {
  const raw = p2p?.node?.publicUrl
  if (!is_reportable_public_url(raw)) return undefined
  return normalize_public_url(raw)
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
      log_p2p_info('identity.ensure.skipped_disabled')
      return null
    }
    if (!p2p?.role?.node) {
      log_p2p_info('identity.ensure.skipped_node_role_disabled')
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
            log_p2p_info('identity.local_tracker_node_missing', { nodeId: p2p.node.nodeId })
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
      log_p2p_info('identity.invalidated_on_tracker', { nodeId: p2p.node.nodeId })
      this.clearLocalIdentity()
    }

    const nodeName = p2p.node?.nodeName || os.hostname() || 'smanga-node'

    // 1) 本机即 tracker 时,直接本地落库,不依赖 HTTP
    if (this.isLocalTracker(p2p)) {
      try {
        const identity = await this.registerLocally(nodeName, p2p)
        log_p2p_info('identity.register.local.success', {
          nodeId: identity.nodeId,
          nodeName: identity.nodeName,
        })
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
      log_p2p_info('identity.register.remote.skipped_no_tracker')
      this.lastRegisterError = new Error('未配置 trackers 且本机非 tracker 角色')
      return null
    }

    log_p2p_info('identity.register.remote.started', { trackerUrl })
    const client = new TrackerClient(trackerUrl)
    try {
      const res = await client.register({
        nodeName,
        version: 'smanga-adonis',
        publicUrl: resolvePublicUrl(p2p),
      })

      // 回写配置
      config.p2p.node.nodeId = res.nodeId
      config.p2p.node.nodeToken = res.nodeToken
      config.p2p.node.nodeName = nodeName
      if (res.publicUrl) {
        config.p2p.node.publicUrl = normalize_public_url(res.publicUrl)
      }
      set_config(config)

      log_p2p_info('identity.register.remote.success', {
        trackerUrl,
        nodeId: res.nodeId,
        publicUrl: res.publicUrl || null,
      })
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
        log_p2p_info('identity.register.remote.network_unreachable', {
          trackerUrl,
          code: e?.code || null,
        })
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
        publicUrl: resolvePublicUrl(p2p),
      })
      return true
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 401 || status === 403) {
        return false
      }
      // 网络错误等暂时性问题:不当作失效,避免误清身份
      if (process.env.P2P_DEBUG) {
        log_p2p_info('identity.verify.network_error_debug', {
          status: status || null,
          message: e?.message || '',
        })
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
   * 手动注册(用户在设置页点"立即注册节点"按钮触发)
   *
   * 与 invalidateAndReregister 的差异:
   *  - 若本地 nodeId/nodeToken 在 tracker 仍然有效 → 不生成新 nodeId,
   *    仅把最新 publicUrl / nodeName 推送到 tracker(心跳+更新)
   *  - 若身份失效或本地无身份 → 才走完整重注册流程
   *
   * 这样可避免每次手动点击都产生一个新的节点记录、污染 tracker 节点表,
   * 也能让用户修改 publicUrl/节点名后一键"同步到 tracker"。
   */
  async manualRegister(): Promise<{
    identity: P2PIdentity
    reused: boolean // true=复用已有身份仅更新信息; false=走了全新注册
  }> {
    const p2p = get_config()?.p2p
    if (!p2p?.enable) throw new Error('P2P 未启用')
    if (!p2p?.role?.node) throw new Error('未开启节点角色')

    const hasLocalIdentity = !!(p2p.node?.nodeId && p2p.node?.nodeToken)

    // 1) 已有本地身份 → 先验证在 tracker 侧是否仍有效
    if (hasLocalIdentity) {
      const valid = await this.verifyIdentityOnTracker(p2p)
      if (valid) {
        // 有效 → 只推送最新信息到 tracker(不换 nodeId)
        await this.pushUpdateToTracker(p2p)
        log_p2p_info('identity.manual_register.reused', {
          nodeId: p2p.node.nodeId,
          nodeName: p2p.node.nodeName || '',
        })
        return {
          identity: {
            nodeId: p2p.node.nodeId,
            nodeToken: p2p.node.nodeToken,
            nodeName: p2p.node.nodeName || '',
          },
          reused: true,
        }
      }
      log_p2p_info('identity.manual_register.invalidated', { nodeId: p2p.node.nodeId })
    }

    // 2) 无身份或身份失效 → 走完整重注册
    const fresh = await this.invalidateAndReregister()
    return { identity: fresh, reused: false }
  }

  /**
   * 将本地配置里的最新端点信息推送到 tracker
   *  - 本机 tracker: 直接写 tracker_node 表
   *  - 远端 tracker: heartbeat 覆盖 publicUrl,updateNode 覆盖 nodeName
   *
   * 任一子步骤失败都直接抛错给调用方,让用户看到具体原因。
   */
  private async pushUpdateToTracker(p2p: any): Promise<void> {
    const nodeId: string = p2p.node.nodeId
    const nodeToken: string = p2p.node.nodeToken
    const nodeName: string = p2p.node?.nodeName || os.hostname() || 'smanga-node'

    // 本机 tracker: 直接走 syncLocalTrackerNode(upsert)路径,避免 HTTP 自调
    if (this.isLocalTracker(p2p)) {
      await this.syncLocalTrackerNode(p2p)
      // nodeName 需要单独更新(syncLocalTrackerNode 只在 create 时写入 nodeName)
      await prisma.tracker_node.update({
        where: { nodeId },
        data: { nodeName },
      })
      return
    }

    // 远端 tracker: heartbeat + updateNode
    const url = this.pickTrackerUrl(p2p)
    if (!url) throw new Error('未配置 tracker 地址')

    const client = new TrackerClient(url, nodeId, nodeToken)

    // heartbeat 会触发 tracker 端反向可达性校验并更新 publicUrl
    await client.heartbeat({
      publicUrl: resolvePublicUrl(p2p),
    })

    // nodeName 通过 updateNode 同步(heartbeat 不处理 nodeName)
    try {
      await client.updateNode({ nodeName })
    } catch (e: any) {
      // nodeName 更新失败不阻塞主流程,只记录日志
      log_p2p_error('identity.manualRegister.updateNodeName', e)
    }
  }

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
   * publicUrl 决策:
   *  - 用户在 smanga.json 配置了 p2p.node.publicUrl(且 host 非 loopback) -> 规范化后采用
   *  - 否则置 null(留空),等节点首次心跳/外部请求时由 tracker 侧识别
   *    (一体机自连无法识别外部 IP,这一步交给后续真实远程心跳来填补)
   */
  private async registerLocally(nodeName: string, p2p: any): Promise<P2PIdentity> {
    const nodeId = uuidv4()
    const rawToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const cfgPublicUrl = resolvePublicUrl(p2p) // 已过滤掉 loopback

    if (!cfgPublicUrl) {
      log_p2p_info('identity.local_register.public_url_empty')
    }

    await prisma.tracker_node.create({
      data: {
        nodeId,
        nodeToken: tokenHash,
        nodeName: nodeName || null,
        publicUrl: cfgPublicUrl || null,
        version: 'smanga-adonis',
        userAgent: 'local-init',
        online: 1,
        lastHeartbeat: new Date(),
      },
    })

    // 回写配置(仅 nodeId/nodeToken/nodeName,publicUrl 不主动写入 loopback)
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

    const cfgPublicUrl = resolvePublicUrl(p2p)

    await prisma.tracker_node.upsert({
      where: { nodeId },
      update: {
        // 仅更新必要字段,避免覆盖人工修改
        nodeToken: tokenHash,
        online: 1,
        lastHeartbeat: new Date(),
        ...(cfgPublicUrl && { publicUrl: cfgPublicUrl }),
      },
      create: {
        nodeId,
        nodeToken: tokenHash,
        nodeName: p2p?.node?.nodeName || null,
        // 仅当配置里显式给了真实可达 URL(非 loopback)才入库,避免污染
        publicUrl: cfgPublicUrl || null,
        version: 'smanga-adonis',
        userAgent: 'local-sync',
        online: 1,
        lastHeartbeat: new Date(),
      },
    })

    log_p2p_info('identity.sync_local_tracker_node.completed', { nodeId })
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
