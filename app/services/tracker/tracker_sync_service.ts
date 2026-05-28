import axios from 'axios'
import prisma from '#start/prisma'
import { get_config, set_config } from '#utils/index'
import { log_p2p_error } from '#utils/p2p_log'

interface SyncGroup {
  groupNo: string
  groupName: string
  describe: string | null
  password: string
  ownerNodeId: string
  maxMembers: number
  memberCount: number
}

interface SyncNode {
  nodeId: string
  nodeName: string | null
  publicUrl: string | null
  version: string | null
  online: number
  lastHeartbeat: string | null
}

interface SyncMember {
  nodeId: string
  nodeName: string | null
  role: string
  online: number
  publicUrl: string | null
}

interface SyncShare {
  nodeId: string
  shareType: string
  remoteMediaId: number | null
  remoteMangaId: number | null
  shareName: string
  coverUrl: string | null
  mangaCount: number
  totalSize: string | null
}

interface SyncManifest {
  nodeId: string
  shareType: string
  remoteMediaId: number | null
  remoteMangaId: number | null
  version: number
  contentHash: string
  payloadTruncated: number
  payloadSize: number
  shareName: string
  coverUrl: string | null
  coverSize: number | null
  describe: string | null
  mangaCount: number
  chapterCount: number
  totalSize: string | null
  payload?: string
}

class TrackerSyncService {
  private timer: NodeJS.Timeout | null = null
  private running = false

  private getPeerTrackerUrls(): string[] {
    const cfg = get_config()?.p2p
    if (!cfg?.enable || !cfg?.role?.tracker) return []
    const raw = cfg?.tracker?.peers?.length ? cfg.tracker.peers : (cfg?.node?.trackers || [])
    const selfUrl = (cfg?.tracker?.publicUrl || '').replace(/\/+$/, '')

    return raw
      .map((url: string) => String(url || '').replace(/\/+$/, ''))
      .filter(Boolean)
      .filter((url: string) => url !== selfUrl)
      .filter((url: string, index: number, list: string[]) => list.indexOf(url) === index)
  }

  start() {
    if (this.running) return
    const cfg = get_config()?.p2p
    if (!cfg?.enable || !cfg?.role?.tracker || !cfg?.tracker?.syncKey) return

    const peers = this.getPeerTrackerUrls()
    if (!peers.length) {
      console.warn('[tracker-sync] no peer trackers configured')
      return
    }

    const intervalSec = Math.max(30, Number(cfg?.tracker?.syncIntervalSec) || 300)
    this.running = true

    this.timer = setTimeout(() => {
      this.syncAll().catch(() => {})
      this.timer = setInterval(() => {
        this.syncAll().catch(() => {})
      }, intervalSec * 1000)
    }, 30_000)
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer)
      clearInterval(this.timer)
    }
    this.timer = null
    this.running = false
  }

  async triggerSync(): Promise<{ ok: boolean; message: string }> {
    const cfg = get_config()?.p2p
    if (!cfg?.enable || !cfg?.role?.tracker) return { ok: false, message: 'tracker disabled' }
    if (!cfg?.tracker?.syncKey) return { ok: false, message: 'syncKey missing' }
    const peers = this.getPeerTrackerUrls()
    if (!peers.length) return { ok: false, message: 'no peer tracker' }

    await this.syncAll()
    return { ok: true, message: `synced ${peers.length} peer trackers` }
  }

  private async syncAll() {
    const syncKey = get_config()?.p2p?.tracker?.syncKey
    if (!syncKey) return
    for (const peerUrl of this.getPeerTrackerUrls()) {
      try {
        await this.syncFromPeer(peerUrl, syncKey)
      } catch (error) {
        log_p2p_error(`tracker-sync(${peerUrl})`, error)
      }
    }
  }

  private async syncFromPeer(peerUrl: string, syncKey: string) {
    const baseUrl = peerUrl.replace(/\/+$/, '')
    const headers = { 'X-Sync-Key': syncKey }

    const nodesRes = await axios.get(`${baseUrl}/tracker/sync/nodes`, { headers, timeout: 10_000 })
    const groupsRes = await axios.get(`${baseUrl}/tracker/sync/groups`, { headers, timeout: 10_000 })

    const nodes: SyncNode[] = nodesRes.data?.list || []
    const groups: SyncGroup[] = groupsRes.data?.list || []

    await this.mergeNodes(nodes)
    await this.mergeGroups(groups)

    for (const group of groups) {
      const groupNo = group.groupNo
      const encodedGroupNo = encodeURIComponent(groupNo)
      const [membersRes, sharesRes, manifestsRes] = await Promise.allSettled([
        axios.get(`${baseUrl}/tracker/sync/group/${encodedGroupNo}/members`, {
          headers,
          timeout: 10_000,
        }),
        axios.get(`${baseUrl}/tracker/sync/group/${encodedGroupNo}/shares`, {
          headers,
          timeout: 10_000,
        }),
        axios.get(`${baseUrl}/tracker/sync/group/${encodedGroupNo}/manifests`, {
          headers,
          timeout: 10_000,
        }),
      ])

      if (membersRes.status === 'fulfilled') {
        await this.mergeGroupMembers(groupNo, membersRes.value.data?.list || [], group.ownerNodeId)
      } else {
        log_p2p_error(`tracker-sync-members(${peerUrl}/${groupNo})`, membersRes.reason)
      }

      if (sharesRes.status === 'fulfilled') {
        await this.mergeShares(groupNo, sharesRes.value.data?.list || [])
      } else {
        log_p2p_error(`tracker-sync-shares(${peerUrl}/${groupNo})`, sharesRes.reason)
      }

      if (manifestsRes.status === 'fulfilled') {
        await this.mergeManifests(groupNo, manifestsRes.value.data?.list || [])
      } else {
        log_p2p_error(`tracker-sync-manifests(${peerUrl}/${groupNo})`, manifestsRes.reason)
      }
    }

    try {
      const peersRes = await axios.get(`${baseUrl}/tracker/sync/peers`, { headers, timeout: 10_000 })
      const peersData = peersRes.data?.data || peersRes.data
      await this.mergePeers(peerUrl, peersData?.selfUrl, peersData?.knownUrls || [])
    } catch (error) {
      log_p2p_error(`tracker-sync-peers(${peerUrl})`, error)
    }
  }

  private async mergeNodes(nodes: SyncNode[]) {
    for (const node of nodes) {
      const existing = await prisma.tracker_node.findUnique({ where: { nodeId: node.nodeId } })
      if (existing) {
        await prisma.tracker_node
          .update({
            where: { nodeId: node.nodeId },
            data: {
              nodeName: node.nodeName,
              publicUrl: node.publicUrl,
              version: node.version,
              online: node.online ?? existing.online,
              lastHeartbeat: node.lastHeartbeat ? new Date(node.lastHeartbeat) : existing.lastHeartbeat,
            },
          })
          .catch((err: any) => log_p2p_error(`tracker-sync-mergeNode.update(${node.nodeId})`, err))
        continue
      }

      await prisma.tracker_node
        .create({
          data: {
            nodeId: node.nodeId,
            nodeToken: '',
            nodeName: node.nodeName,
            publicUrl: node.publicUrl,
            version: node.version,
            userAgent: 'sync-import',
            online: node.online ?? 0,
            lastHeartbeat: node.lastHeartbeat ? new Date(node.lastHeartbeat) : null,
          },
        })
        .catch((err: any) => log_p2p_error(`tracker-sync-mergeNode.create(${node.nodeId})`, err))
    }
  }

  private async mergeGroups(groups: SyncGroup[]) {
    for (const group of groups) {
      await prisma.tracker_group
        .upsert({
          where: { groupNo: group.groupNo },
          create: {
            groupNo: group.groupNo,
            groupName: group.groupName,
            describe: group.describe,
            password: group.password,
            ownerNodeId: group.ownerNodeId,
            maxMembers: group.maxMembers,
            memberCount: group.memberCount,
            enable: 1,
          },
          update: {
            groupName: group.groupName,
            describe: group.describe,
            password: group.password,
            ownerNodeId: group.ownerNodeId,
            maxMembers: group.maxMembers,
            memberCount: group.memberCount,
            enable: 1,
            updateTime: new Date(),
          },
        })
        .catch((err: any) => log_p2p_error(`tracker-sync-mergeGroup(${group.groupNo})`, err))
    }
  }

  private async mergeGroupMembers(groupNo: string, members: SyncMember[], ownerNodeId: string) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) return

    for (const member of members) {
      let node = await prisma.tracker_node.findUnique({ where: { nodeId: member.nodeId } })
      if (!node) {
        await prisma.tracker_node
          .create({
            data: {
              nodeId: member.nodeId,
              nodeToken: '',
              nodeName: member.nodeName,
              publicUrl: member.publicUrl,
              version: null,
              userAgent: 'sync-import',
              online: member.online ?? 0,
              lastHeartbeat: null,
            },
          })
          .catch((err: any) =>
            log_p2p_error(`tracker-sync-mergeMember.createNode(${member.nodeId})`, err)
          )

        // 节点创建可能失败(如唯一约束冲突),重新检查是否存在
        node = await prisma.tracker_node.findUnique({ where: { nodeId: member.nodeId } })
        if (!node) {
          // 节点不存在,跳过该成员的 membership upsert(否则 FK 约束会失败)
          log_p2p_error(
            `tracker-sync-mergeMember.skip(${groupNo}/${member.nodeId})`,
            new Error('节点创建失败或不存在,跳过成员关系同步')
          )
          continue
        }
      }

      await prisma.tracker_membership
        .upsert({
          where: {
            trackerGroupId_nodeId: {
              trackerGroupId: group.trackerGroupId,
              nodeId: member.nodeId,
            },
          },
          create: {
            trackerGroupId: group.trackerGroupId,
            nodeId: member.nodeId,
            role: member.nodeId === ownerNodeId ? 'owner' : member.role || 'member',
          },
          update: {
            role: member.nodeId === ownerNodeId ? 'owner' : member.role || 'member',
            updateTime: new Date(),
          },
        })
        .catch((err: any) =>
          log_p2p_error(`tracker-sync-mergeMember.upsert(${groupNo}/${member.nodeId})`, err)
        )
    }

    // 同步完成后矫正 memberCount = 实际成员关系数
    const actualCount = await prisma.tracker_membership.count({
      where: { trackerGroupId: group.trackerGroupId },
    })
    if (actualCount !== group.memberCount) {
      await prisma.tracker_group
        .update({
          where: { trackerGroupId: group.trackerGroupId },
          data: { memberCount: actualCount },
        })
        .catch((err: any) =>
          log_p2p_error(`tracker-sync-fixMemberCount(${groupNo})`, err)
        )
    }
  }

  private async mergeShares(groupNo: string, shares: SyncShare[]) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) return

    for (const share of shares) {
      const existing = await prisma.tracker_share_index.findFirst({
        where: {
          trackerGroupId: group.trackerGroupId,
          nodeId: share.nodeId,
          shareType: share.shareType,
          remoteMediaId: share.remoteMediaId,
          remoteMangaId: share.remoteMangaId,
        },
      })
      if (existing) {
        await prisma.tracker_share_index.update({
          where: { trackerShareIndexId: existing.trackerShareIndexId },
          data: {
            shareName: share.shareName,
            coverUrl: share.coverUrl,
            mangaCount: share.mangaCount || 0,
            totalSize: share.totalSize ? BigInt(share.totalSize) : null,
            enable: 1,
            updateTime: new Date(),
          },
        }).catch(() => {})
      } else {
        await prisma.tracker_share_index.create({
          data: {
            trackerGroupId: group.trackerGroupId,
            nodeId: share.nodeId,
            shareType: share.shareType,
            remoteMediaId: share.remoteMediaId,
            remoteMangaId: share.remoteMangaId,
            shareName: share.shareName,
            coverUrl: share.coverUrl,
            mangaCount: share.mangaCount || 0,
            totalSize: share.totalSize ? BigInt(share.totalSize) : null,
            enable: 1,
          },
        }).catch(() => {})
      }
    }
  }

  private async mergeManifests(groupNo: string, manifests: SyncManifest[]) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) return

    for (const manifest of manifests) {
      const current = await prisma.tracker_share_manifest.findFirst({
        where: {
          trackerGroupId: group.trackerGroupId,
          nodeId: manifest.nodeId,
          shareType: manifest.shareType,
          remoteMediaId: manifest.remoteMediaId,
          remoteMangaId: manifest.remoteMangaId,
        },
      })

      const nextVersion = BigInt(manifest.version || Date.now())
      if (current && current.version > nextVersion) continue

      if (current) {
        await prisma.tracker_share_manifest.update({
          where: { trackerShareManifestId: current.trackerShareManifestId },
          data: {
            version: nextVersion,
            contentHash: manifest.contentHash,
            payloadTruncated: manifest.payloadTruncated,
            payloadSize: manifest.payloadSize,
            shareName: manifest.shareName,
            coverUrl: manifest.coverUrl,
            coverSize: manifest.coverSize,
            describe: manifest.describe,
            mangaCount: manifest.mangaCount || 0,
            chapterCount: manifest.chapterCount || 0,
            totalSize: manifest.totalSize ? BigInt(manifest.totalSize) : null,
            payload: manifest.payload || current.payload || '',
            updateTime: new Date(),
          },
        }).catch(() => {})
      } else {
        await prisma.tracker_share_manifest.create({
          data: {
            trackerGroupId: group.trackerGroupId,
            nodeId: manifest.nodeId,
            shareType: manifest.shareType,
            remoteMediaId: manifest.remoteMediaId,
            remoteMangaId: manifest.remoteMangaId,
            version: nextVersion,
            contentHash: manifest.contentHash,
            payloadTruncated: manifest.payloadTruncated,
            payloadSize: manifest.payloadSize,
            shareName: manifest.shareName,
            coverUrl: manifest.coverUrl,
            coverSize: manifest.coverSize,
            describe: manifest.describe,
            mangaCount: manifest.mangaCount || 0,
            chapterCount: manifest.chapterCount || 0,
            totalSize: manifest.totalSize ? BigInt(manifest.totalSize) : null,
            payload: manifest.payload || '',
          },
        }).catch(() => {})
      }
    }
  }

  private async mergePeers(peerUrl: string, peerSelfUrl: string | null, knownUrls: string[]) {
    const config = get_config()
    const p2p = config?.p2p
    if (!p2p?.enable || !p2p?.role?.tracker) return

    const current: string[] = (p2p.tracker?.peers || p2p.node?.trackers || []).slice()
    const normalizedCurrent = new Set(current.map((item) => item.replace(/\/+$/, '').toLowerCase()))
    let changed = false

    const pushUrl = (url: string | null | undefined) => {
      const normalized = String(url || '').replace(/\/+$/, '')
      if (!normalized) return
      const key = normalized.toLowerCase()
      if (normalizedCurrent.has(key)) return
      normalizedCurrent.add(key)
      current.push(normalized)
      changed = true
    }

    if (peerSelfUrl && peerSelfUrl.replace(/\/+$/, '') !== peerUrl.replace(/\/+$/, '')) {
      pushUrl(peerSelfUrl)
    }
    for (const url of knownUrls || []) pushUrl(url)

    if (changed) {
      config.p2p.tracker.peers = current
      set_config(config)
    }
  }
}

export default new TrackerSyncService()
