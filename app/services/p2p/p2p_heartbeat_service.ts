/**
 * P2P 心跳服务
 *
 * 职责:
 *  - 按 heartbeatInterval 向所有配置的 Tracker 发送心跳
 *  - 心跳失败静默重试,下一个周期继续
 *  - 提供 start/stop 供外部在配置变更后重启
 */

import { get_config } from '#utils/index'
import TrackerClient from './tracker_client.js'
import p2pIdentityService from './p2p_identity_service.js'
import { parse_public_url, is_reportable_public_url } from '#utils/ip_resolver'
import { reconcileGroupsWithTracker } from './p2p_group_reconcile_service.js'

class P2PHeartbeatService {
  private timer: NodeJS.Timeout | null = null
  private running = false
  /** 心跳计数器,用于按节拍触发 reconcile */
  private tickCount = 0
  /** 每 N 个心跳节拍触发一次群组对账(默认 10 次,30s 心跳即 5 分钟一次) */
  private static RECONCILE_TICKS = 10

  /**
   * 启动心跳循环
   */
  async start() {
    if (this.running) return
    const p2p = get_config()?.p2p
    if (!p2p?.enable || !p2p?.role?.node) {
      return
    }

    // 首次确保身份存在
    const identity = await p2pIdentityService.ensureIdentity()
    if (!identity) {
      console.warn(
        '[p2p] 心跳服务启动失败:无有效身份 (具体原因见上方 [p2p] identity.* 日志)'
      )
      return
    }

    const intervalSec = Math.max(10, Number(p2p.node?.heartbeatInterval) || 30)
    this.running = true

    // 立即发一次再进入循环
    this.tick().catch(() => { })
    this.timer = setInterval(() => {
      this.tick().catch(() => { })
    }, intervalSec * 1000)

    console.log(`[p2p] 心跳服务已启动,间隔 ${intervalSec}s`)
  }

  /**
   * 停止心跳循环
   */
  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.running = false
  }

  /**
   * 重启(用于配置变更后生效)
   */
  async restart() {
    this.stop()
    await this.start()
  }

  /**
   * 单次心跳 tick:向所有 trackers 并行发送
   */
  private async tick() {
    const p2p = get_config()?.p2p
    if (!p2p?.enable || !p2p?.role?.node) {
      this.stop()
      return
    }

    const identity = p2pIdentityService.getIdentity()
    if (!identity) return

    const trackers: string[] = p2p.node?.trackers || []
    // 若是一体机且未配置 trackers,回落自身
    const list =
      trackers.length > 0
        ? trackers
        : p2p.role?.tracker
          ? [p2pIdentityService.pickTrackerUrl(p2p)].filter(Boolean) as string[]
          : []

    if (!list.length) return

    await Promise.all(
      list.map(async (url) => {
        try {
          const client = new TrackerClient(url, identity.nodeId, identity.nodeToken)
          // 同步上报当前实际监听端口(优先 process.env.PORT)
          // 以便 tracker 里的 publicUrl/localPort 始终指向正在监听的端口
          const envPort = Number(process.env.PORT)
          const runtimePort = Number.isFinite(envPort) && envPort > 0
            ? envPort
            : (p2p.node?.listenPort || p2p.node?.lanPort || undefined)
          // 计算 publicUrl:用户填了真实可达地址才上报;未指定端口时用 runtimePort 补齐
          let publicUrl: string | undefined = undefined
          const cfgPublicUrl = p2p.node?.publicUrl
          if (is_reportable_public_url(cfgPublicUrl)) {
            const parsed = parse_public_url(cfgPublicUrl)
            if (parsed) {
              publicUrl = parsed.port
                ? parsed.url
                : (runtimePort ? `${parsed.protocol}://${parsed.host}:${runtimePort}` : parsed.url)
            }
          }
          await client.heartbeat({
            publicUrl,
            localHost: p2p.node?.lanHost || undefined,
            localPort: runtimePort,
          })
        } catch (e: any) {
          const status = e?.response?.status
          // 401/403 通常意味着 tracker 不认识本节点(数据库重建/换 tracker),
          // 此时自动作废本地身份并重新注册,避免陷入"节点不存在"死循环
          if (status === 401 || status === 403) {
            console.warn(
              `[p2p] 心跳 ${url} 返回 ${status} (${e?.response?.data?.message || ''}),自动重新注册节点`
            )
            try {
              const fresh = await p2pIdentityService.invalidateAndReregister()
              console.log(`[p2p] 节点已重新注册 nodeId=${fresh.nodeId}`)
            } catch (reErr: any) {
              console.warn(
                `[p2p] 节点自动重新注册失败: ${reErr?.message || reErr}`
              )
            }
            return
          }
          // 静默失败,避免日志风暴
          if (process.env.P2P_DEBUG) {
            console.warn('[p2p] 心跳失败', url, status || e?.message)
          }
        }
      })
    )

    // 每 N 个心跳节拍触发一次本地群组对账,清理 tracker 已删除但本地仍存在的"幽灵群"
    // 走 reconcileGroupsWithTracker 内部已对 tracker 不可达做了"不删除"保护,无需额外保护
    this.tickCount += 1
    if (this.tickCount >= P2PHeartbeatService.RECONCILE_TICKS) {
      this.tickCount = 0
      try {
        const r = await reconcileGroupsWithTracker()
        if (r.ok && r.removed.length) {
          console.log(`[p2p] 心跳对账清理孤儿群 ${r.removed.length} 个`)
        }
      } catch (e: any) {
        if (process.env.P2P_DEBUG) {
          console.warn('[p2p] 心跳对账失败', e?.message)
        }
      }
    }
  }
}

export default new P2PHeartbeatService()