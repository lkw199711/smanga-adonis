import prisma from '#start/prisma'
import type { AnnouncePayload, AnnounceResult } from '#type/p2p'

/**
 * Tracker 共享索引服务
 * 节点上报 → 索引入库 → 供群组内其他节点查询
 */
class TrackerShareService {
  /**
   * 节点向某群组上报共享清单(全量覆盖该节点在该群的索引)
   *
   * 兼容两种 share 上报:
   *   - 仅元数据(老节点):只写 tracker_share_index
   *   - 带 manifest(新节点):同步 upsert 到 tracker_share_manifest,生成 version 返回
   */
  async announce(
    nodeId: string,
    groupNo: string,
    payload: AnnouncePayload
  ): Promise<{ accepted: number; rejected: number; shares: AnnounceResult['shares'] }> {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group || group.enable === 0) throw new Error('群组不存在或已停用')

    // 校验是否成员
    const m = await prisma.tracker_membership.findFirst({
      where: { trackerGroupId: group.trackerGroupId, nodeId },
    })
    if (!m) throw new Error('非群组成员')

    const shares = payload.shares || []

    // 全量覆盖策略: 先删除该节点在该群的旧 index 记录, 再插入新记录
    await prisma.tracker_share_index.deleteMany({
      where: { trackerGroupId: group.trackerGroupId, nodeId },
    })

    let accepted = 0
    const result: AnnounceResult['shares'] = []

    for (const s of shares) {
      if (!s.shareName) continue
      if (s.shareType !== 'media' && s.shareType !== 'manga') continue
      if (s.shareType === 'media' && !s.remoteMediaId) continue
      if (s.shareType === 'manga' && !s.remoteMangaId) continue

      // 1) 写 index(老逻辑保留,findSeeds 仍依赖)
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

      // 2) 处理 manifest(若节点上报了)
      const r = await this._upsertManifest(group.trackerGroupId, nodeId, s)
      result.push(r)
    }

    // 更新最后上报时间
    await prisma.tracker_membership.update({
      where: { trackerMembershipId: m.trackerMembershipId },
      data: { lastAnnounce: new Date() },
    })

    return { accepted, rejected: shares.length - accepted, shares: result }
  }

  /**
   * 处理单个 share 的 manifest 持久化
   * - 上报了 manifest 且 hash 变化:生成新 version 并 upsert
   * - 上报了 manifest 但 hash 未变:沿用旧 version,只刷新 updateTime
   * - 未上报 manifest(老节点或 hash 未变化优化):查现有记录返回,无则返回 0/''
   */
  private async _upsertManifest(
    trackerGroupId: number,
    nodeId: string,
    s: AnnouncePayload['shares'][number]
  ): Promise<AnnounceResult['shares'][number]> {
    const shareType = s.shareType as string
    const remoteMediaId = s.remoteMediaId ?? null
    const remoteMangaId = s.remoteMangaId ?? null

    // 注: 复合唯一键中含 nullable 字段(remoteMediaId/remoteMangaId)时,
    // Prisma 的 findUnique 会校验类型为非 null,传 null 直接 400 报错。
    // 因此改用 findFirst 按各字段精确匹配(包括 null),功能等价。
    const existing = await prisma.tracker_share_manifest.findFirst({
      where: {
        trackerGroupId,
        nodeId,
        shareType,
        remoteMediaId,
        remoteMangaId,
      },
    })

    // 节点未上报 manifest:返回现有记录的 version,若无记录则返回占位
    if (!s.manifest) {
      return {
        shareType,
        remoteMediaId,
        remoteMangaId,
        version: existing ? Number(existing.version) : 0,
        contentHash: existing?.contentHash ?? '',
      }
    }

    const m = s.manifest

    // hash 未变化:仅刷新 updateTime,不生成新 version
    if (existing && existing.contentHash === m.contentHash) {
      await prisma.tracker_share_manifest.update({
        where: { trackerShareManifestId: existing.trackerShareManifestId },
        data: { updateTime: new Date() },
      })
      return {
        shareType,
        remoteMediaId,
        remoteMangaId,
        version: Number(existing.version),
        contentHash: existing.contentHash,
      }
    }

    // hash 变化或全新:生成新 version,从 payload 解出摘要字段
    const newVersion = BigInt(Date.now())
    const summary = this._extractSummary(m.payload)

    if (existing) {
      await prisma.tracker_share_manifest.update({
        where: { trackerShareManifestId: existing.trackerShareManifestId },
        data: {
          version: newVersion,
          contentHash: m.contentHash,
          payloadTruncated: m.payloadTruncated,
          payloadSize: m.payloadSize,
          shareName: summary.shareName ?? s.shareName,
          coverUrl: summary.coverUrl ?? s.coverUrl ?? null,
          coverSize: summary.coverSize,
          describe: summary.describe,
          mangaCount: summary.mangaCount ?? s.mangaCount ?? 0,
          chapterCount: summary.chapterCount,
          totalSize:
            summary.totalSize !== null
              ? BigInt(summary.totalSize)
              : s.totalSize !== undefined
                ? BigInt(s.totalSize)
                : null,
          payload: m.payload,
        },
      })
    } else {
      await prisma.tracker_share_manifest.create({
        data: {
          trackerGroupId,
          nodeId,
          shareType,
          remoteMediaId,
          remoteMangaId,
          version: newVersion,
          contentHash: m.contentHash,
          payloadTruncated: m.payloadTruncated,
          payloadSize: m.payloadSize,
          shareName: summary.shareName ?? s.shareName,
          coverUrl: summary.coverUrl ?? s.coverUrl ?? null,
          coverSize: summary.coverSize,
          describe: summary.describe,
          mangaCount: summary.mangaCount ?? s.mangaCount ?? 0,
          chapterCount: summary.chapterCount,
          totalSize:
            summary.totalSize !== null
              ? BigInt(summary.totalSize)
              : s.totalSize !== undefined
                ? BigInt(s.totalSize)
                : null,
          payload: m.payload,
        },
      })
    }

    return {
      shareType,
      remoteMediaId,
      remoteMangaId,
      version: Number(newVersion),
      contentHash: m.contentHash,
    }
  }

  /**
   * 从序列化的 manifest payload 中解析出 summary 字段
   * 容错:解析失败时返回全 null,由调用方回退到 share 元数据
   */
  private _extractSummary(payloadJson: string): {
    shareName: string | null
    coverUrl: string | null
    coverSize: number | null
    describe: string | null
    mangaCount: number | null
    chapterCount: number
    totalSize: number | null
  } {
    try {
      const obj = JSON.parse(payloadJson)
      return {
        shareName: obj?.share?.shareName ?? null,
        coverUrl: obj?.share?.coverUrl ?? null,
        coverSize: obj?.share?.coverSize ?? null,
        describe: obj?.share?.describe ?? null,
        mangaCount: obj?.stats?.mangaCount ?? null,
        chapterCount: obj?.stats?.chapterCount ?? 0,
        totalSize: obj?.stats?.totalSize ?? null,
      }
    } catch {
      return {
        shareName: null,
        coverUrl: null,
        coverSize: null,
        describe: null,
        mangaCount: null,
        chapterCount: 0,
        totalSize: null,
      }
    }
  }

  /**
   * 批量拉取群组内 manifest 摘要(不含 payload)
   * - 支持 since 增量过滤(毫秒时间戳)
   * - 节点端可拿来与本地 p2p_peer_share_manifest 对比 contentHash 做差量更新
   */
  async listManifestSummaries(
    groupNo: string,
    opts: { since?: number; nodeId?: string } = {}
  ) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group || group.enable === 0) throw new Error('群组不存在或已停用')

    const where: any = { trackerGroupId: group.trackerGroupId }
    if (opts.nodeId) where.nodeId = opts.nodeId
    if (opts.since && opts.since > 0) {
      where.updateTime = { gt: new Date(opts.since) }
    }

    const rows = await prisma.tracker_share_manifest.findMany({
      where,
      orderBy: { updateTime: 'desc' },
      select: {
        trackerShareManifestId: true,
        nodeId: true,
        shareType: true,
        remoteMediaId: true,
        remoteMangaId: true,
        version: true,
        contentHash: true,
        payloadTruncated: true,
        payloadSize: true,
        shareName: true,
        coverUrl: true,
        coverSize: true,
        describe: true,
        mangaCount: true,
        chapterCount: true,
        totalSize: true,
        updateTime: true,
      },
    })

    // 关联节点信息(nodeName/online)
    const nodeIds = Array.from(new Set(rows.map((r) => r.nodeId)))
    const nodes = nodeIds.length
      ? await prisma.tracker_node.findMany({
          where: { nodeId: { in: nodeIds } },
          select: { nodeId: true, nodeName: true, online: true },
        })
      : []
    const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]))

    const list = rows.map((r) => ({
      trackerShareManifestId: r.trackerShareManifestId,
      nodeId: r.nodeId,
      nodeName: nodeMap.get(r.nodeId)?.nodeName ?? null,
      online: nodeMap.get(r.nodeId)?.online ?? 0,
      shareType: r.shareType,
      remoteMediaId: r.remoteMediaId,
      remoteMangaId: r.remoteMangaId,
      version: Number(r.version),
      contentHash: r.contentHash,
      payloadTruncated: r.payloadTruncated,
      payloadSize: r.payloadSize,
      shareName: r.shareName,
      coverUrl: r.coverUrl,
      coverSize: r.coverSize,
      describe: r.describe,
      mangaCount: r.mangaCount,
      chapterCount: r.chapterCount,
      totalSize: r.totalSize !== null ? r.totalSize.toString() : null,
      updateTime: r.updateTime.getTime(),
    }))

    return { list, count: list.length, serverTime: Date.now() }
  }

  /**
   * 获取单个 manifest 的完整 payload(含详情版文件树,若未被截断)
   * - 当 payloadTruncated=1 时,payload 不含 tree 字段,需调用 seed 端代理 API
   */
  async getManifestDetail(
    groupNo: string,
    params: {
      nodeId: string
      shareType: 'media' | 'manga' | string
      remoteMediaId?: number | null
      remoteMangaId?: number | null
    }
  ) {
    const group = await prisma.tracker_group.findUnique({ where: { groupNo } })
    if (!group || group.enable === 0) throw new Error('群组不存在或已停用')

    // 同样使用 findFirst 绕过复合唯一键对 nullable 字段的限制
    const row = await prisma.tracker_share_manifest.findFirst({
      where: {
        trackerGroupId: group.trackerGroupId,
        nodeId: params.nodeId,
        shareType: params.shareType,
        remoteMediaId: params.remoteMediaId ?? null,
        remoteMangaId: params.remoteMangaId ?? null,
      },
    })
    if (!row) throw new Error('manifest 不存在')

    return {
      trackerShareManifestId: row.trackerShareManifestId,
      nodeId: row.nodeId,
      shareType: row.shareType,
      remoteMediaId: row.remoteMediaId,
      remoteMangaId: row.remoteMangaId,
      version: Number(row.version),
      contentHash: row.contentHash,
      payloadTruncated: row.payloadTruncated,
      payloadSize: row.payloadSize,
      shareName: row.shareName,
      coverUrl: row.coverUrl,
      coverSize: row.coverSize,
      describe: row.describe,
      mangaCount: row.mangaCount,
      chapterCount: row.chapterCount,
      totalSize: row.totalSize !== null ? row.totalSize.toString() : null,
      payload: row.payload, // 序列化的 JSON 字符串
      updateTime: row.updateTime.getTime(),
    }
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
          publicUrl: n.publicUrl,
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