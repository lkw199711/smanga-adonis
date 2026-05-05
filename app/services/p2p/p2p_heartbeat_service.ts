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

class P2PHeartbeatService {
  private timer: NodeJS.Timeout | null = null
  private running = false

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
          await client.heartbeat({
            localHost: p2p.node?.lanHost || undefined,
            localPort: p2p.node?.lanPort || p2p.node?.listenPort || undefined,
          })
        } catch (e: any) {
          // 静默失败,避免日志风暴
          if (process.env.P2P_DEBUG) {
            console.warn('[p2p] 心跳失败', url, e?.response?.status || e?.message)
          }
        }
      })
    )
  }
}

export default new P2PHeartbeatService()