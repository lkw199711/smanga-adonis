/**
 * Tracker 可达性探测服务
 *
 * 启动时对 trackers 列表中所有地址做快速探测（短超时 HTTP GET），
 * 将结果缓存为 reachable / unreachable 两组，供上层选择 tracker 时使用。
 *
 * 策略：
 *  - 首次 probeAll() 阻塞探测全部，结果缓存 60 秒
 *  - 后续 getReachableTrackers() 返回缓存，缓存过期自动重新探测
 *  - 业务层调用 markUnreachable(url) 可主动标记某个 tracker 不可达
 */

import axios from 'axios'
import { get_config } from '#utils/index'

export interface ProbeResult {
  url: string
  reachable: boolean
  reason?: string
  elapsedMs: number
}

class TrackerProbeService {
  /** 探测缓存：url → 是否可达 */
  private cache = new Map<string, boolean>()
  /** 缓存时间戳 */
  private cacheTime = 0
  /** 缓存有效期 ms */
  private readonly CACHE_TTL = 60_000

  /**
   * 获取所有配置的 tracker 地址列表
   */
  getAllTrackerUrls(): string[] {
    const cfg = get_config()?.p2p
    if (!cfg?.enable || !cfg?.role?.node) return []

    const trackers: string[] = cfg?.node?.trackers || []
    if (trackers.length > 0) return trackers

    // 若自身是 tracker，回落本地
    if (cfg?.role?.tracker) {
      const publicUrl = cfg?.tracker?.publicUrl
      if (publicUrl) return [publicUrl]
      const port = process.env.PORT || 3000
      return [`http://127.0.0.1:${port}`]
    }

    return []
  }

  /**
   * 获取当前可达的 tracker 地址列表（优先走缓存）
   */
  getReachableTrackers(): string[] {
    const urls = this.getAllTrackerUrls()
    if (!urls.length) return []

    const now = Date.now()
    const expired = now - this.cacheTime > this.CACHE_TTL

    // 缓存有效则直接返回
    if (!expired && this.cache.size > 0) {
      return urls.filter((u) => this.cache.get(u) === true)
    }

    // 缓存过期或无缓存：返回空（触发异步探测），但立即返回缓存的旧值以免阻塞
    // 调用方应容忍返回空数组
    if (this.cache.size === 0) {
      return urls // 首次：未探测前全部视为"可能可达"
    }

    return urls.filter((u) => this.cache.get(u) === true)
  }

  /**
   * 获取所有可达的 tracker URL（确保至少探测一次，阻塞等待）
   */
  async ensureProbed(): Promise<string[]> {
    await this.probeAll()
    const urls = this.getAllTrackerUrls()
    return urls.filter((u) => this.cache.get(u) === true)
  }

  /**
   * 探测所有 tracker（并行，每个 3 秒超时）
   */
  async probeAll(): Promise<ProbeResult[]> {
    const urls = this.getAllTrackerUrls()
    if (!urls.length) {
      this.cacheTime = Date.now()
      return []
    }

    const results = await Promise.all(
      urls.map((url) => this._probeSingle(url))
    )

    // 更新缓存
    for (const r of results) {
      this.cache.set(r.url, r.reachable)
    }
    this.cacheTime = Date.now()

    const reachable = results.filter((r) => r.reachable)
    const unreachable = results.filter((r) => !r.reachable)

    if (reachable.length > 0) {
      console.log(
        `[tracker-probe] 可达: ${reachable.map((r) => `${r.url} (${r.elapsedMs}ms)`).join(', ')}`
      )
    }
    if (unreachable.length > 0) {
      console.warn(
        `[tracker-probe] 不可达: ${unreachable.map((r) => `${r.url} (${r.reason})`).join(', ')}`
      )
    }

    return results
  }

  /**
   * 标记某个 tracker 不可达（业务层感知到连接失败后调用）
   */
  markUnreachable(url: string): void {
    this.cache.set(url, false)
    this.cacheTime = Date.now() // 刷新缓存时间，避免立即又被 probeAll 覆盖
  }

  /**
   * 探测单个 tracker URL
   * 向 tracker 根路径发 GET（3s 超时），任何非网络错误的响应都算可达
   */
  private async _probeSingle(url: string): Promise<ProbeResult> {
    const started = Date.now()
    try {
      await axios.get(url, {
        timeout: 3000,
        validateStatus: () => true, // 任何 HTTP 状态码都接受
      })
      return { url, reachable: true, elapsedMs: Date.now() - started }
    } catch (e: any) {
      const reason =
        e?.code === 'ECONNREFUSED'
          ? '连接被拒绝'
          : e?.code === 'ENOTFOUND'
            ? 'DNS 解析失败'
            : e?.code === 'ETIMEDOUT' || e?.code === 'ECONNABORTED'
              ? '超时'
              : e?.message || '未知错误'
      return { url, reachable: false, reason, elapsedMs: Date.now() - started }
    }
  }
}

export default new TrackerProbeService()
