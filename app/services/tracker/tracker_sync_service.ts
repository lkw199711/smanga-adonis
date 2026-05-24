/**
 * Tracker 间数据同步服务
 *
 * 职责:
 *  - 定期从其他 peer tracker 拉取群组/节点/成员数据进行对账
 *  - upsert 缺失的数据到本地数据库,实现多 tracker 间最终一致性
 *  - 解决 tracker 临时宕机导致的数据缺口
 *
 * 调用时机:
 *  - 启动后延迟首次同步(等自身服务就绪)
 *  - 之后按配置的 syncIntervalSec 定期执行
 */

import axios from 'axios'
import prisma from '#start/prisma'
import { get_config, set_config } from '#utils/index'
import { log_p2p_error } from '#utils/p2p_log'
import crypto from 'crypto'

interface SyncGroup {
  groupNo: string
  groupName: string
  describe: string | null
  password: string
  ownerNodeId: string
  maxMembers: number
  memberCount: number
  createTime: string
  updateTime: string
}

interface SyncNode {
  nodeId: string
  nodeName: string | null
  publicUrl: string | null
  version: string | null
  online: number
  lastHeartbeat: string | null
  createTime: string
  updateTime: string
}

interface SyncMember {
  nodeId: string
  nodeName: string | null
  role: string
  online: number
  publicUrl: string | null
  joinTime: string
}

class TrackerSyncService {
  private timer: NodeJS.Timeout | null = null
  private running = false

  /**
   * 获取所有 peer tracker 地址(排除自身)
   */
  private getPeerTrackerUrls(): string[] {
    const cfg = get_config()?.p2p
    if (!cfg?.enable || !cfg?.role?.tracker) return []

    const trackers: string[] = cfg?.node?.trackers || []
    if (trackers.length === 0) return []

    // 排除自身
    const selfUrl = (cfg?.tracker?.publicUrl || '').replace(/\/+$/, '')
    return trackers.filter((url) => {
      const normalized = url.replace(/\/+$/, '')
      if (selfUrl && normalized === selfUrl) return false
      // 也排除 localhost/127.0.0.1
      try {
        const u = new URL(normalized)
        return !['localhost', '127.0.0.1', '::1'].includes(u.hostname)
      } catch {
        return false
      }
    })
  }

  /**
   * 启动同步循环
   */
  start() {
    if (this.running) return
    const cfg = get_config()?.p2p
    if (!cfg?.enable || !cfg?.role?.tracker) return

    const syncKey = cfg?.tracker?.syncKey
    if (!syncKey) {
      console.log('[tracker-sync] 未配置 syncKey,跳过 tracker 间同步')
      return
    }

    const peers = this.getPeerTrackerUrls()
    if (peers.length === 0) {
      console.log('[tracker-sync] 未发现 peer tracker,跳过同步')
      return
    }

    const intervalSec = Math.max(30, Number(cfg?.tracker?.syncIntervalSec) || 300)
    this.running = true

    console.log(
      `[tracker-sync] 同步服务已启动,peer trackers: ${peers.length} 个,间隔 ${intervalSec}s`
    )

    // 首次延迟 30s 执行(等自身服务就绪)
    this.timer = setTimeout(() => {
      this.syncAll().catch(() => {})
      // 之后按间隔定期执行
      this.timer = setInterval(() => {
        this.syncAll().catch(() => {})
      }, intervalSec * 1000)
    }, 30_000)
  }

  /**
   * 停止同步循环
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      clearTimeout(this.timer)
    }
    this.timer = null
    this.running = false
  }

  /**
   * 手动触发一次完整同步
   * 供前端按钮调用,立即从所有 peer tracker 拉取数据
   */
  async triggerSync(): Promise<{ ok: boolean; message: string }> {
    const cfg = get_config()?.p2p
    if (!cfg?.enable || !cfg?.role?.tracker) {
      return { ok: false, message: 'Tracker 未启用' }
    }
    if (!cfg?.tracker?.syncKey) {
      return { ok: false, message: '未配置同步密钥' }
    }
    const peers = this.getPeerTrackerUrls()
    if (peers.length === 0) {
      return { ok: false, message: '未发现 peer tracker' }
    }
    try {
      await this.syncAll()
      return { ok: true, message: `同步完成,已处理 ${peers.length} 个 peer tracker` }
    } catch (e: any) {
      return { ok: false, message: e?.message || '同步失败' }
    }
  }

  /**
   * 执行完整的同步流程:从所有 peer tracker 拉取数据并合并
   */
  private async syncAll(): Promise<void> {
    const peers = this.getPeerTrackerUrls()
    if (peers.length === 0) return

    const syncKey = get_config()?.p2p?.tracker?.syncKey
    if (!syncKey) return

    for (const peerUrl of peers) {
      try {
        await this.syncFromPeer(peerUrl, syncKey)
      } catch (e: any) {
        if (process.env.P2P_DEBUG) {
          console.warn(`[tracker-sync] 从 ${peerUrl} 同步失败: ${e?.message}`)
        }
      }
    }
  }

  /**
   * 从单个 peer tracker 拉取并合并数据
   */
  private async syncFromPeer(peerUrl: string, syncKey: string): Promise<void> {
    const baseUrl = peerUrl.replace(/\/+$/, '')
    const headers = { 'X-Sync-Key': syncKey }

    // 1) 同步节点
    try {
      const nodesRes = await axios.get(`${baseUrl}/tracker/sync/nodes`, {
        headers,
        timeout: 10_000,
      })
      const nodes: SyncNode[] = nodesRes.data?.list || []
      await this.mergeNodes(nodes)
      if (process.env.P2P_DEBUG) {
        console.log(`[tracker-sync] 从 ${peerUrl} 同步节点 ${nodes.length} 个`)
      }
    } catch (e: any) {
      log_p2p_error(`sync.nodes(${peerUrl})`, e)
    }

    // 2) 同步群组
    let groups: SyncGroup[] = []
    try {
      const groupsRes = await axios.get(`${baseUrl}/tracker/sync/groups`, {
        headers,
        timeout: 10_000,
      })
      groups = groupsRes.data?.list || []
      await this.mergeGroups(groups)
      if (process.env.P2P_DEBUG) {
        console.log(`[tracker-sync] 从 ${peerUrl} 同步群组 ${groups.length} 个`)
      }
    } catch (e: any) {
      log_p2p_error(`sync.groups(${peerUrl})`, e)
    }

    // 3) 同步每个群组的成员
    for (const g of groups) {
      try {
        const membersRes = await axios.get(
          `${baseUrl}/tracker/sync/group/${encodeURIComponent(g.groupNo)}/members`,
          { headers, timeout: 10_000 }
        )
        const members: SyncMember[] = membersRes.data?.list || []
        await this.mergeGroupMembers(g.groupNo, members, g.ownerNodeId)
      } catch (e: any) {
        // 群组可能已被删除,忽略即可
      }
    }

    // 4) 同步 peer 列表(动态发现新 tracker + 检测域名迁移)
    try {
      const peersRes = await axios.get(`${baseUrl}/tracker/sync/peers`, {
        headers,
        timeout: 10_000,
      })
      const peersData = peersRes.data?.data || peersRes.data
      await this.mergePeers(peerUrl, peersData?.selfUrl, peersData?.knownUrls || [])
    } catch (e: any) {
      // peers 同步失败不影响主数据同步
    }

    console.log(
      `[tracker-sync] 从 ${peerUrl} 同步完成: ${groups.length} 个群组, ${await this.countSynced()}`
    )
  }

  /**
   * 合并节点:upsert 不存在的节点,不更新已存在的(避免覆盖本地真实数据)
   */
  private async mergeNodes(nodes: SyncNode[]): Promise<void> {
    if (!nodes.length) return
    for (const n of nodes) {
      try {
        const existing = await prisma.tracker_node.findUnique({
          where: { nodeId: n.nodeId },
        })
        if (existing) continue // 已存在,跳过

        // 节点 token 在同步时不传输,设为占位符
        // 节点下次心跳会自然补全正确的 token hash
        await prisma.tracker_node.create({
          data: {
            nodeId: n.nodeId,
            nodeToken: crypto.randomBytes(32).toString('hex'), // 占位,心跳会更新
            nodeName: n.nodeName || null,
            publicUrl: n.publicUrl || null,
            version: n.version || null,
            userAgent: 'sync-import',
            online: 0, // 保守:标记离线,等待下次心跳确认
            lastHeartbeat: null,
          },
        })
      } catch (e: any) {
        // 并发 upsert 可能冲突,忽略
      }
    }
  }

  /**
   * 合并群组:upsert 不存在的群组
   */
  private async mergeGroups(groups: SyncGroup[]): Promise<void> {
    if (!groups.length) return
    for (const g of groups) {
      try {
        const existing = await prisma.tracker_group.findUnique({
          where: { groupNo: g.groupNo },
        })
        if (existing) {
          // 已存在,更新 memberCount 等统计信息
          await prisma.tracker_group.update({
            where: { groupNo: g.groupNo },
            data: {
              memberCount: g.memberCount,
              updateTime: new Date(),
            },
          })
          continue
        }

        await prisma.tracker_group.create({
          data: {
            groupNo: g.groupNo,
            groupName: g.groupName,
            describe: g.describe || null,
            password: g.password,
            ownerNodeId: g.ownerNodeId,
            maxMembers: g.maxMembers,
            memberCount: g.memberCount,
            enable: 1,
          },
        })
      } catch (e: any) {
        // 并发 upsert 可能冲突,忽略
      }
    }
  }

  /**
   * 合并群组成员:同步缺失的成员关系
   */
  private async mergeGroupMembers(
    groupNo: string,
    members: SyncMember[],
    ownerNodeId: string
  ): Promise<void> {
    if (!members.length) return

    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) return // 群组还没同步过来,跳过

    for (const m of members) {
      try {
        const existing = await prisma.tracker_membership.findFirst({
          where: { trackerGroupId: group.trackerGroupId, nodeId: m.nodeId },
        })
        if (existing) continue // 已存在

        // 确保节点存在(至少有个占位记录)
        const nodeExists = await prisma.tracker_node.findUnique({
          where: { nodeId: m.nodeId },
        })
        if (!nodeExists) {
          await prisma.tracker_node.create({
            data: {
              nodeId: m.nodeId,
              nodeToken: crypto.randomBytes(32).toString('hex'),
              nodeName: m.nodeName || null,
              publicUrl: m.publicUrl || null,
              version: null,
              userAgent: 'sync-import',
              online: 0,
              lastHeartbeat: null,
            },
          })
        }

        await prisma.tracker_membership.create({
          data: {
            trackerGroupId: group.trackerGroupId,
            nodeId: m.nodeId,
            role: m.nodeId === ownerNodeId ? 'owner' : (m.role || 'member'),
          },
        })
      } catch (e: any) {
        // 并发冲突,忽略
      }
    }
  }

  /**
   * 统计同步了多少数据(供日志)
   */
  private async countSynced(): Promise<string> {
    try {
      const [groupCount, nodeCount] = await Promise.all([
        prisma.tracker_group.count({ where: { enable: 1 } }),
        prisma.tracker_node.count(),
      ])
      return `${groupCount} 个群组, ${nodeCount} 个节点`
    } catch {
      return '统计失败'
    }
  }

  /**
   * 合并 peer tracker 列表
   *
   * 两个功能:
   *  1. 域名迁移检测: peer 的 selfUrl 与连接用的 peerUrl 不同 → 替换旧地址
   *  2. 动态发现: knownUrls 中未知的 tracker 地址 → 追加到配置
   *
   * 场景:
   *  - Tracker B 域名从 old.com 改为 new.com
   *  - Tracker A 同步 B 时: peerUrl=old.com, selfUrl=new.com
   *    → 自动将 trackers 中的 old.com 替换为 new.com
   *  - 下次心跳时 knownTrackers 传播会给所有节点
   */
  private async mergePeers(
    peerUrl: string,
    peerSelfUrl: string | null,
    knownUrls: string[]
  ): Promise<void> {
    const config = get_config()
    const p2p = config?.p2p
    if (!p2p?.enable || !p2p?.role?.tracker) return

    const normalizedPeer = peerUrl.replace(/\/+$/, '').toLowerCase()
    const normalizedSelf = (peerSelfUrl || '').replace(/\/+$/, '').toLowerCase()

    const current: string[] = (p2p.node?.trackers || []).slice()
    let changed = false

    // 1) 域名迁移检测: selfUrl 与连接地址不同且 selfUrl 非空
    if (normalizedSelf && normalizedSelf !== normalizedPeer) {
      const idx = current.findIndex(
        (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase() === normalizedPeer
      )
      if (idx >= 0) {
        current[idx] = peerSelfUrl!.replace(/\/+$/, '')
        changed = true
        console.log(
          `[tracker-sync] 检测到 tracker 域名迁移: ${peerUrl} → ${peerSelfUrl}`
        )
      } else {
        // 可能的场景: peer 的 publicUrl 不在我们的 trackers 配置中,
        // 但它是通过我们的 publicUrl 反向发现的,直接追加
        const selfClean = peerSelfUrl!.replace(/\/+$/, '')
        if (!current.some((u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase() === normalizedSelf)) {
          current.push(selfClean)
          changed = true
          console.log(`[tracker-sync] 反向发现 peer tracker: ${selfClean}`)
        }
      }
    }

    // 2) 动态发现: knownUrls 去重合并
    const currentSet = new Set(
      current.map((u: string) => String(u || '').trim().replace(/\/+$/, '').toLowerCase())
    )
    for (const raw of knownUrls) {
      const normalized = String(raw || '').trim().replace(/\/+$/, '')
      if (!normalized) continue
      try {
        const u = new URL(normalized)
        if (['localhost', '127.0.0.1', '::1'].includes(u.hostname)) continue
      } catch { continue }

      const key = normalized.toLowerCase()
      if (!currentSet.has(key)) {
        currentSet.add(key)
        current.push(normalized)
        changed = true
        console.log(`[tracker-sync] 动态发现新 tracker: ${normalized}`)
      }
    }

    if (changed) {
      config.p2p.node.trackers = current
      set_config(config)
      console.log(`[tracker-sync] tracker 列表已更新,当前共 ${current.length} 个`)
    }
  }
}

export default new TrackerSyncService()
