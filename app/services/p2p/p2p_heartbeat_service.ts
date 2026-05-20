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
import { normalize_public_url, is_reportable_public_url } from '#utils/ip_resolver'
import { reconcileGroupsWithTracker } from './p2p_group_reconcile_service.js'
import manifestSyncService from './manifest/manifest_sync_service.js'
import { log_p2p_error, log_p2p_info } from '#utils/p2p_log'

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
      log_p2p_info('heartbeat.start.skipped_no_identity', { reason: 'identity_unavailable' })
      return
    }

    const intervalSec = Math.max(10, Number(p2p.node?.heartbeatInterval) || 30)
    this.running = true

    // 立即发一次再进入循环
    this.tick().catch(() => { })
    this.timer = setInterval(() => {
      this.tick().catch(() => { })
    }, intervalSec * 1000)

    log_p2p_info('heartbeat.started', {
      nodeId: identity.nodeId,
      intervalSec,
      trackerCount: Array.isArray(p2p.node?.trackers) ? p2p.node.trackers.length : 0,
    })
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
          // publicUrl 完全信任用户配置:仅做 normalize(补 http://、去尾斜杠)
          // 不再拆分 host/port、不再用本机 listenPort 覆盖,避免与用户填的反代地址冲突
          let publicUrl: string | undefined = undefined
          const cfgPublicUrl = p2p.node?.publicUrl
          if (is_reportable_public_url(cfgPublicUrl)) {
            publicUrl = normalize_public_url(cfgPublicUrl)
          }
          const hb = await client.heartbeat({ publicUrl })

          // 处理 tracker 推送的通知(粗粒度 piggyback)
          if (hb && Array.isArray(hb.pendingNotifications)) {
            for (const n of hb.pendingNotifications) {
              if (n?.type === 'manifest_changed' && n?.data?.groupNo) {
                // 异步触发该群的 manifest 增量同步,不阻塞心跳循环
                manifestSyncService.syncGroup(String(n.data.groupNo)).catch(() => {})
              }
            }
          }
        } catch (e: any) {
          const status = e?.response?.status
          // 401/403 通常意味着 tracker 不认识本节点(数据库重建/换 tracker),
          // 此时自动作废本地身份并重新注册,避免陷入"节点不存在"死循环
          if (status === 401 || status === 403) {
            log_p2p_info('heartbeat.reregister.triggered', {
              trackerUrl: url,
              status,
              message: e?.response?.data?.message || '',
            })
            try {
              const fresh = await p2pIdentityService.invalidateAndReregister()
              log_p2p_info('heartbeat.reregistered', {
                trackerUrl: url,
                nodeId: fresh.nodeId,
                status,
              })
            } catch (reErr: any) {
              log_p2p_error('heartbeat.auto-reregister', reErr)
            }
            return
          }
          // 静默失败,避免日志风暴
          if (process.env.P2P_DEBUG) {
            log_p2p_info('heartbeat.failed.debug', {
              trackerUrl: url,
              status: status || null,
              message: e?.message || '',
            })
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
          log_p2p_info('heartbeat.reconcile.cleaned', {
            removedCount: r.removed.length,
            remoteCount: r.remoteCount,
            upserted: r.upserted,
          })
        }
      } catch (e: any) {
        if (process.env.P2P_DEBUG) {
          log_p2p_info('heartbeat.reconcile.failed.debug', {
            message: e?.message || '',
          })
        }
      }
    }
  }
}

export default new P2PHeartbeatService()
