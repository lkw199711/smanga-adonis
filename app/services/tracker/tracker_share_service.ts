import prisma from '#start/prisma'
import type { AnnouncePayload } from '#type/p2p'

/**
 * Tracker 共享索引服务
 * 节点上报 → 索引入库 → 供群组内其他节点查询
 */
class TrackerShareService {
  /**
   * 节点向某群组上报共享清单(全量覆盖该节点在该群的索引)
   */
  async announce(nodeId: string, groupNo: string, payload: AnnouncePayload) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group || group.enable === 0) throw new Error('群组不存在或已停用')

    // 校验是否成员
    const m = await prisma.tracker_membership.findFirst({
      where: { trackerGroupId: group.trackerGroupId, nodeId },
    })
    if (!m) throw new Error('非群组成员')

    const shares = payload.shares || []

    // 全量覆盖策略: 先删除该节点在该群的旧记录, 再插入新记录
    await prisma.tracker_share_index.deleteMany({
      where: { trackerGroupId: group.trackerGroupId, nodeId },
    })

    let accepted = 0
    for (const s of shares) {
      if (!s.shareName) continue
      if (s.shareType !== 'media' && s.shareType !== 'manga') continue
      if (s.shareType === 'media' && !s.remoteMediaId) continue
      if (s.shareType === 'manga' && !s.remoteMangaId) continue

      await prisma.tracker_share_index.create({
        data: {
          trackerGroupId: group.trackerGroupId,
          nodeId,
          shareType: s.shareType,
          remoteMediaId: s.remoteMediaId ?? null,
          remoteMangaId: s.remoteMangaId ?? null,
          shareName: s.shareName,
          coverUrl: s.coverUrl || null,
          mangaCount: s.mangaCount ?? 0,
          totalSize: s.totalSize !== undefined ? BigInt(s.totalSize) : null,
          enable: 1,
        },
      })
      accepted++
    }

    // 更新最后上报时间
    await prisma.tracker_membership.update({
      where: { trackerMembershipId: m.trackerMembershipId },
      data: { lastAnnounce: new Date() },
    })

    return { accepted, rejected: shares.length - accepted }
  }

  /**
   * 拉取群组内所有共享索引
   */
  async listGroupShares(
    groupNo: string,
    opts: { page?: number; pageSize?: number; keyword?: string } = {}
  ) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group) throw new Error('群组不存在')

    const where: any = {
      trackerGroupId: group.trackerGroupId,
      enable: 1,
    }
    if (opts.keyword) {
      where.shareName = { contains: opts.keyword }
    }

    const page = opts.page ?? 1
    const pageSize = opts.pageSize ?? 20

    const [rows, count] = await Promise.all([
      prisma.tracker_share_index.findMany({
        where,
        orderBy: { updateTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.tracker_share_index.count({ where }),
    ])

    // 关联节点信息(nodeName/online)
    const nodeIds = Array.from(new Set(rows.map((r) => r.nodeId)))
    const nodes = await prisma.tracker_node.findMany({
      where: { nodeId: { in: nodeIds } },
      select: { nodeId: true, nodeName: true, online: true },
    })
    const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]))

    const list = rows.map((r) => ({
      trackerShareIndexId: r.trackerShareIndexId,
      nodeId: r.nodeId,
      nodeName: nodeMap.get(r.nodeId)?.nodeName ?? null,
      online: nodeMap.get(r.nodeId)?.online ?? 0,
      shareType: r.shareType,
      remoteMediaId: r.remoteMediaId,
      remoteMangaId: r.remoteMangaId,
      shareName: r.shareName,
      coverUrl: r.coverUrl,
      mangaCount: r.mangaCount,
      totalSize: r.totalSize !== null ? r.totalSize.toString() : null,
      updateTime: r.updateTime,
    }))

    return { list, count }
  }

  /**
   * 查询某群组内拥有指定资源的所有节点(seeds)
   * - shareType='media':按 remoteMediaId 匹配
   * - shareType='manga':按 remoteMangaId 匹配
   * - shareType='chapter':章节通过漫画级共享体现,因此回落到按 remoteMangaId 匹配
   *
   * 返回结构带节点在线/网络信息,便于调用方直接拼装 baseUrl
   */
  async findSeeds(
    groupNo: string,
    params: {
      shareType: 'media' | 'manga' | 'chapter'
      remoteMediaId?: number
      remoteMangaId?: number
    }
  ) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group || group.enable === 0) throw new Error('群组不存在或已停用')

    const where: any = { trackerGroupId: group.trackerGroupId, enable: 1 }

    if (params.shareType === 'media') {
      if (!params.remoteMediaId) throw new Error('remoteMediaId 必填')
      where.shareType = 'media'
      where.remoteMediaId = params.remoteMediaId
    } else {
      // manga / chapter 都要求 remoteMangaId
      if (!params.remoteMangaId) throw new Error('remoteMangaId 必填')
      // chapter 级也通过 manga 级共享体现,所以统一匹配 shareType='manga'
      where.shareType = 'manga'
      where.remoteMangaId = params.remoteMangaId
    }

    const rows = await prisma.tracker_share_index.findMany({
      where,
      orderBy: { updateTime: 'desc' },
    })
    if (!rows.length) return { list: [], count: 0 }

    const nodeIds = Array.from(new Set(rows.map((r) => r.nodeId)))
    const nodes = await prisma.tracker_node.findMany({
      where: { nodeId: { in: nodeIds } },
    })
    const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]))

    // 优先在线 seeds;在线节点按 lastHeartbeat 倒序
    const list = rows
      .map((r) => {
        const n = nodeMap.get(r.nodeId)
        if (!n) return null
        return {
          nodeId: r.nodeId,
          nodeName: n.nodeName,
          online: n.online,
          publicHost: n.publicHost,
          publicPort: n.publicPort,
          localHost: n.localHost,
          localPort: n.localPort,
          lastHeartbeat: n.lastHeartbeat,
          shareName: r.shareName,
        }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => {
        if (a.online !== b.online) return (b.online ?? 0) - (a.online ?? 0)
        const la = a.lastHeartbeat ? new Date(a.lastHeartbeat).getTime() : 0
        const lb = b.lastHeartbeat ? new Date(b.lastHeartbeat).getTime() : 0
        return lb - la
      })

    return { list, count: list.length }
  }

  /**
   * 清空节点在某群的所有共享(退群时使用)
   */
  async clearByNode(nodeId: string, groupNo?: string) {
    const where: any = { nodeId }
    if (groupNo) {
      const g = await prisma.tracker_group.findUnique({ where: { groupNo } })
      if (!g) return
      where.trackerGroupId = g.trackerGroupId
    }
    await prisma.tracker_share_index.deleteMany({ where })
  }
}

export default new TrackerShareService()