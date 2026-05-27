/**
 * P2P 身份管理服务（精简版：无 nodeToken）
 *
 * 职责:
 *  - 保证本节点在所有 tracker 上已注册(serverKey 作为 nodeId)
 *  - 注册成功后回写 nodeId(=serverKey)/nodeName 到 smanga.json
 *  - 提供给其他服务统一的身份读取入口
 *
 * 鉴权策略（简化后）:
 *  - nodeId = serverKey（smanga 实例的全局唯一密钥）
 *  - 不再使用 nodeToken，tracker 中间件仅校验 X-Node-Id 是否存在
 *
 * publicUrl 语义:
 *  - 由用户在 smanga.json 的 p2p.node.publicUrl 配置
 *  - 仅在上报时做一次规范化(补 http:// 前缀、去尾部斜杠)
 *  - tracker 侧也直接信任这个 URL
 */

import os from 'os'
import { get_config, set_config } from '#utils/index'
import prisma from '#start/prisma'
import TrackerClient from './tracker_client.js'
import trackerProbeService from './tracker_probe_service.js'
import { log_p2p_error } from '#utils/p2p_log'
import { normalize_public_url, is_reportable_public_url } from '#utils/ip_resolver'

/** 简化后的身份类型 */
export type P2PIdentity = {
  nodeId: string
  nodeName: string
}

/** 单个 tracker 的注册结果 */
export interface TrackerRegisterResult {
  trackerUrl: string
  success: boolean
  publicUrl?: string
  error?: string
  reused?: boolean
}

/**
 * 解析节点对外可达 publicUrl
 */
function resolvePublicUrl(p2p: any): string | undefined {
  const raw = p2p?.node?.publicUrl
  if (!is_reportable_public_url(raw)) return undefined
  return normalize_public_url(raw)
}

class P2PIdentityService {
  /**
   * 向所有 tracker 并行注册，返回每个 tracker 的结果
   *
   * 这是三处注册逻辑的统一入口：
   *  - 启动时 ensureIdentity()
   *  - 手动点击按钮 manualRegister()
   *  - 心跳 401/403 重注册
   */
  async registerToAllTrackers(options: {
    forceReregister?: boolean
  } = {}): Promise<{
    results: TrackerRegisterResult[]
    anySuccess: boolean
    reused: boolean
  }> {
    const config = get_config()
    const p2p = config?.p2p
    if (!p2p?.enable) {
      return { results: [], anySuccess: false, reused: false }
    }
    if (!p2p?.role?.node) {
      return { results: [], anySuccess: false, reused: false }
    }

    const serverKey = config?.serverKey
    if (!serverKey) {
      const err: TrackerRegisterResult = {
        trackerUrl: '(本地)',
        success: false,
        error: '缺少 serverKey，无法注册节点',
      }
      return { results: [err], anySuccess: false, reused: false }
    }

    const nodeName = p2p.node?.nodeName || os.hostname() || 'smanga-node'
    const publicUrl = resolvePublicUrl(p2p)

    // 判断是否已有身份（nodeId = serverKey）
    const existingNodeId = p2p.node?.nodeId
    const hasIdentity = !!existingNodeId && !options.forceReregister

    // 已有身份且非强制重注册：先验证是否仍然有效
    if (hasIdentity) {
      const valid = await this.verifyIdentityQuick(p2p, existingNodeId, publicUrl)
      if (valid) {
        // 身份有效，仅推送更新到所有 tracker（更新 publicUrl/nodeName）
        const results = await this.pushUpdateToAllTrackers(p2p, existingNodeId, nodeName, publicUrl)
        console.log(
          `[p2p] registerToAllTrackers: 复用 nodeId=${existingNodeId}，已更新各 tracker 信息`
        )
        return { results, anySuccess: results.some((r) => r.success), reused: true }
      }
      console.warn(
        `[p2p] registerToAllTrackers: nodeId=${existingNodeId} 在 tracker 端已失效，将重新注册`
      )
    }

    // 走完整注册：并行向所有 tracker 注册
    const urls = trackerProbeService.getAllTrackerUrls()

    // 对于本地 tracker 场景：直接 upsert 到 tracker_node 表
    if (this.isLocalTracker(p2p)) {
      const localUrl = this.pickTrackerUrl(p2p) || '(本地)'
      try {
        await prisma.tracker_node.upsert({
          where: { nodeId: serverKey },
          update: {
            nodeName,
            publicUrl: publicUrl || undefined,
            version: 'smanga-adonis',
            userAgent: 'local-register',
            online: 1,
            lastHeartbeat: new Date(),
          },
          create: {
            nodeId: serverKey,
            nodeToken: '',
            nodeName,
            publicUrl: publicUrl || null,
            version: 'smanga-adonis',
            userAgent: 'local-register',
            online: 1,
            lastHeartbeat: new Date(),
          },
        })
        console.log(`[p2p] 本地直注册成功 nodeId=${serverKey}`)

        // 保存 identity 到配置
        config.p2p.node.nodeId = serverKey
        config.p2p.node.nodeName = nodeName
        set_config(config)

        const localResult: TrackerRegisterResult = {
          trackerUrl: localUrl,
          success: true,
          publicUrl: publicUrl || '',
        }

        // 如果还有远程 tracker，也并行注册过去
        if (urls.length > 0) {
          const remoteResults = await this.registerToRemoteTrackers(
            urls, serverKey, nodeName, publicUrl
          )
          return {
            results: [localResult, ...remoteResults],
            anySuccess: true,
            reused: false,
          }
        }

        return { results: [localResult], anySuccess: true, reused: false }
      } catch (e: any) {
        log_p2p_error('identity.registerLocally', e)
        return {
          results: [{ trackerUrl: localUrl, success: false, error: e?.message || '本地注册失败' }],
          anySuccess: false,
          reused: false,
        }
      }
    }

    // 纯远程 tracker 场景
    const results = await this.registerToRemoteTrackers(urls, serverKey, nodeName, publicUrl)
    const anySuccess = results.some((r) => r.success)

    if (anySuccess) {
      config.p2p.node.nodeId = serverKey
      config.p2p.node.nodeName = nodeName
      set_config(config)
      console.log(`[p2p] 远程注册完成: ${results.filter((r) => r.success).length}/${results.length} 个成功`)
    }

    return { results, anySuccess, reused: false }
  }

  /**
   * 并行向所有远程 tracker 注册
   */
  private async registerToRemoteTrackers(
    urls: string[],
    serverKey: string,
    nodeName: string,
    publicUrl: string | undefined
  ): Promise<TrackerRegisterResult[]> {
    if (!urls.length) return []

    const settled = await Promise.allSettled(
      urls.map(async (url): Promise<TrackerRegisterResult> => {
        try {
          const client = new TrackerClient(url)
          const res = await client.register({
            nodeName,
            version: 'smanga-adonis',
            publicUrl,
            serverKey,
          })
          console.log(`[p2p] 注册成功 tracker=${url} nodeId=${res.nodeId}`)
          return {
            trackerUrl: url,
            success: true,
            publicUrl: res.publicUrl || '',
          }
        } catch (e: any) {
          const remoteMsg: string | undefined = e?.response?.data?.message
          const reason = remoteMsg || e?.message || '未知错误'
          if (e?.code === 'ECONNREFUSED' || e?.code === 'ENOTFOUND' || e?.code === 'ETIMEDOUT') {
            console.warn(`[p2p] 注册失败 ${url}: 网络不可达 (${e?.code})`)
          } else {
            log_p2p_error(`identity.register(url=${url})`, e)
          }
          return {
            trackerUrl: url,
            success: false,
            error: reason,
          }
        }
      })
    )

    return settled.map((s) =>
      s.status === 'fulfilled' ? s.value : { trackerUrl: '(unknown)', success: false, error: '内部错误' }
    )
  }

  /**
   * 快速验证身份在 tracker 侧是否仍有效
   * - 本地 tracker：查 tracker_node 表
   * - 远程 tracker：发 heartbeat 探测，401/403 视为失效
   */
  private async verifyIdentityQuick(
    p2p: any,
    nodeId: string,
    publicUrl: string | undefined
  ): Promise<boolean> {
    if (this.isLocalTracker(p2p)) {
      try {
        const node = await prisma.tracker_node.findUnique({ where: { nodeId } })
        return !!node
      } catch {
        return true // 数据库异常时不误清身份
      }
    }

    const url = this.pickTrackerUrl(p2p)
    if (!url) return true
    try {
      const client = new TrackerClient(url, nodeId)
      await client.heartbeat({ publicUrl })
      return true
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 401 || status === 403) return false
      return true // 网络错误保留身份
    }
  }

  /**
   * 向所有 tracker 推送更新（不换 nodeId）
   */
  private async pushUpdateToAllTrackers(
    p2p: any,
    nodeId: string,
    nodeName: string,
    publicUrl: string | undefined
  ): Promise<TrackerRegisterResult[]> {
    const results: TrackerRegisterResult[] = []

    // 本地 tracker
    if (this.isLocalTracker(p2p)) {
      try {
        await prisma.tracker_node.upsert({
          where: { nodeId },
          update: {
            nodeName,
            publicUrl: publicUrl || undefined,
            online: 1,
            lastHeartbeat: new Date(),
          },
          create: {
            nodeId,
            nodeToken: '',
            nodeName,
            publicUrl: publicUrl || null,
            version: 'smanga-adonis',
            userAgent: 'local-update',
            online: 1,
            lastHeartbeat: new Date(),
          },
        })
        results.push({ trackerUrl: '(本地)', success: true, publicUrl: publicUrl || '', reused: true })
      } catch (e: any) {
        results.push({ trackerUrl: '(本地)', success: false, error: e?.message, reused: true })
      }
    }

    // 远程 tracker
    const urls = trackerProbeService.getAllTrackerUrls()
    const settled = await Promise.allSettled(
      urls.map(async (url): Promise<TrackerRegisterResult> => {
        try {
          const client = new TrackerClient(url, nodeId)
          await client.heartbeat({ publicUrl })
          try {
            await client.updateNode({ nodeName })
          } catch {
            // nodeName 更新失败不阻塞
          }
          console.log(`[p2p] 推送更新成功 tracker=${url}`)
          return { trackerUrl: url, success: true, publicUrl: publicUrl || '', reused: true }
        } catch (e: any) {
          const reason = e?.response?.data?.message || e?.message || '未知错误'
          return { trackerUrl: url, success: false, error: reason, reused: true }
        }
      })
    )

    for (const s of settled) {
      results.push(
        s.status === 'fulfilled'
          ? s.value
          : { trackerUrl: '(unknown)', success: false, error: '内部错误', reused: true }
      )
    }

    return results
  }

  /**
   * 获取身份；如缺失或已失效则自动注册
   * 返回 boolean 表示是否注册成功
   */
  async ensureIdentity(options: { forceReregister?: boolean } = {}): Promise<boolean> {
    const { anySuccess } = await this.registerToAllTrackers(options)
    if (!anySuccess) {
      console.warn('[p2p] ensureIdentity: 所有 tracker 注册均失败')
    }
    return anySuccess
  }

  /**
   * 手动注册（用户在设置页点击"立即注册节点"按钮触发）
   * 返回每个 tracker 的结果供前端展示
   */
  async manualRegister(): Promise<{
    results: TrackerRegisterResult[]
    anySuccess: boolean
    reused: boolean
  }> {
    const p2p = get_config()?.p2p
    if (!p2p?.enable) throw new Error('P2P 未启用')
    if (!p2p?.role?.node) throw new Error('未开启节点角色')

    return this.registerToAllTrackers()
  }

  /**
   * 主动作废本地身份并重新注册（供心跳 401/403 时调用）
   */
  async invalidateAndReregister(): Promise<boolean> {
    const config = get_config()
    if (config?.p2p?.node) {
      config.p2p.node.nodeId = ''
      set_config(config)
    }
    const { anySuccess } = await this.registerToAllTrackers({ forceReregister: true })
    if (!anySuccess) {
      console.warn('[p2p] invalidateAndReregister: 重新注册失败')
    }
    return anySuccess
  }

  /**
   * 读取当前身份（不触发注册）
   * nodeId 直接取 serverKey
   */
  getIdentity(): P2PIdentity | null {
    const config = get_config()
    const serverKey = config?.serverKey
    if (!serverKey) return null
    const p2p = config?.p2p
    return {
      nodeId: serverKey,
      nodeName: p2p?.node?.nodeName || '',
    }
  }

  /**
   * 判定当前配置下 tracker 是否就是本机
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
   * 选择 tracker url
   */
  pickTrackerUrl(p2p: any): string | null {
    const trackers: string[] = p2p?.node?.trackers || []
    if (trackers.length > 0) {
      const reachable = trackerProbeService.getReachableTrackers()
      if (reachable.length > 0) return reachable[0]
      return trackers[0]
    }

    if (p2p?.role?.tracker) {
      const publicUrl = p2p?.tracker?.publicUrl
      if (publicUrl) return publicUrl
      const port = process.env.PORT || '9797'
      // AdonisJS 路由统一挂载在 /api 前缀下
      return `http://127.0.0.1:${port}/api`
    }

    return null
  }

  /**
   * 获取所有可达的 tracker 地址列表
   */
  getReachableTrackerUrls(p2p: any): string[] {
    const trackers: string[] = p2p?.node?.trackers || []
    if (trackers.length === 0) {
      if (p2p?.role?.tracker) {
        const url = this.pickTrackerUrl(p2p)
        return url ? [url] : []
      }
      return []
    }
    return trackerProbeService.getReachableTrackers()
  }
}

export default new P2PIdentityService()
