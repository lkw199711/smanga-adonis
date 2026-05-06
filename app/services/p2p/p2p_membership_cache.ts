/**
 * P2P 节点成员关系缓存(进程内 LRU + TTL)
 *
 * 用途:
 *  - p2p_peer_auth_middleware 每次校验远端节点是否为群组合法成员时使用
 *  - 避免 /p2p/serve/file 每图一请求都打一次 tracker DB / HTTP
 *
 * 语义:
 *  - key = `${nodeId}::${groupNo}`
 *  - value:
 *      allow=true  → 已验证是群成员,在 TTL 内直接放行
 *      allow=false → 已验证 "不是群成员"(或群被禁用),短 TTL 内直接拒绝
 *  - 失效策略:
 *      * 正常 TTL 到期自动淘汰
 *      * 群主解散/踢人/用户退群时主动调 invalidateByGroup / invalidate
 *
 * 注意:这是 **缓存** 而不是权威源;权威源永远是 tracker_membership 表。
 */

// 命中缓存的条目
interface CacheEntry {
  allow: boolean
  expireAt: number
}

export class P2PMembershipCache {
  /** 命中的正向缓存 TTL(毫秒) */
  private readonly POSITIVE_TTL_MS = 60 * 1000
  /** 拒绝的负向缓存 TTL(毫秒) —— 短一点,避免刚加入的节点长期被拒 */
  private readonly NEGATIVE_TTL_MS = 10 * 1000
  /** 单进程最多缓存多少条 */
  private readonly MAX_ENTRIES = 5000

  private store = new Map<string, CacheEntry>()

  private buildKey(nodeId: string, groupNo: string): string {
    return `${nodeId}::${groupNo}`
  }

  /**
   * 查询缓存
   * @returns undefined 表示未命中(需要回源验证);true/false 表示命中
   */
  get(nodeId: string, groupNo: string): boolean | undefined {
    const key = this.buildKey(nodeId, groupNo)
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expireAt) {
      this.store.delete(key)
      return undefined
    }
    // LRU:命中后移到尾部
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.allow
  }

  /**
   * 写入缓存
   */
  set(nodeId: string, groupNo: string, allow: boolean): void {
    const key = this.buildKey(nodeId, groupNo)
    const ttl = allow ? this.POSITIVE_TTL_MS : this.NEGATIVE_TTL_MS
    const entry: CacheEntry = { allow, expireAt: Date.now() + ttl }

    // 容量淘汰(LRU:删除 Map 迭代顺序最前的)
    if (!this.store.has(key) && this.store.size >= this.MAX_ENTRIES) {
      const firstKey = this.store.keys().next().value
      if (firstKey !== undefined) this.store.delete(firstKey)
    }

    this.store.set(key, entry)
  }

  /**
   * 按 (nodeId, groupNo) 精确失效(踢人/退群场景)
   */
  invalidate(nodeId: string, groupNo: string): void {
    this.store.delete(this.buildKey(nodeId, groupNo))
  }

  /**
   * 按群组号批量失效(解散群组场景)
   */
  invalidateByGroup(groupNo: string): number {
    const suffix = `::${groupNo}`
    let count = 0
    for (const key of this.store.keys()) {
      if (key.endsWith(suffix)) {
        this.store.delete(key)
        count++
      }
    }
    return count
  }

  /**
   * 清空所有缓存(极少用到:如 P2P 总开关被关闭)
   */
  clear(): void {
    this.store.clear()
  }

  /**
   * 运行时可观察指标
   */
  stats() {
    return {
      size: this.store.size,
      maxEntries: this.MAX_ENTRIES,
      positiveTtlMs: this.POSITIVE_TTL_MS,
      negativeTtlMs: this.NEGATIVE_TTL_MS,
    }
  }
}

export default new P2PMembershipCache()