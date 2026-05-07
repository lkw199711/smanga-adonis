/**
 * P2P 群内节点与共享索引查询控制器(用户侧)
 *
 * 路径:/api/p2p/peer/*
 */

import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '#interfaces/response'
import { get_config } from '#utils/index'
import TrackerClient from '#services/p2p/tracker_client'
import p2pIdentityService from '#services/p2p/p2p_identity_service'
import { log_p2p_error } from '#utils/p2p_log'
import { buildHeaders, discoverSeeds } from '#services/p2p/pull/pull_shared'
import { fetchMangaTree, fetchChapterTree } from '#services/p2p/pull/pull_tree_fetcher'

function get_client(): TrackerClient | null {
  const cfg = get_config()?.p2p
  if (!cfg?.enable || !cfg?.role?.node) return null

  const id = p2pIdentityService.getIdentity()
  if (!id) return null

  const url = p2pIdentityService.pickTrackerUrl(cfg)
  if (!url) return null

  return new TrackerClient(url, id.nodeId, id.nodeToken)
}

export default class P2PPeersController {
  /**
   * GET /api/p2p/peer/members/:groupNo
   * 从 tracker 获取群成员并缓存到 p2p_peer_cache
   */
  async members({ params, response }: HttpContext) {
    const client = get_client()
    if (!client) {
      return response.status(400).json(new SResponse({ code: 1, message: 'P2P 未启用' }))
    }

    const groupNo = params.groupNo
    try {
      const members: any[] = await client.groupMembers(groupNo)
      const group = await prisma.p2p_group.findUnique({ where: { groupNo } })

      if (group) {
        // 同步到本地缓存
        for (const m of members) {
          await prisma.p2p_peer_cache.upsert({
            // 注: schema 中 @@unique([p2pGroupId, nodeId], map: "uniqueGroupNode")
            // map 仅作为数据库索引名;Prisma Client 实际复合键名按字段名拼接为 p2pGroupId_nodeId
            where: { p2pGroupId_nodeId: { p2pGroupId: group.p2pGroupId, nodeId: m.nodeId } },
            update: {
              nodeName: m.nodeName || null,
              publicUrl: m.publicUrl || null,
              localHost: m.localHost || null,
              localPort: m.localPort || null,
              online: m.online ? 1 : 0,
              version: m.version || null,
              lastSeen: m.lastHeartbeat ? new Date(m.lastHeartbeat) : null,
            },
            create: {
              p2pGroupId: group.p2pGroupId,
              nodeId: m.nodeId,
              nodeName: m.nodeName || null,
              publicUrl: m.publicUrl || null,
              localHost: m.localHost || null,
              localPort: m.localPort || null,
              online: m.online ? 1 : 0,
              version: m.version || null,
              lastSeen: m.lastHeartbeat ? new Date(m.lastHeartbeat) : null,
            },
          })
        }
      }

      return response.json(new ListResponse({ code: 0, message: '', list: members, count: members.length }))
    } catch (e: any) {
      log_p2p_error('peer.members', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.response?.data?.message || e?.message || '查询失败' }))
    }
  }

  /**
   * GET /api/p2p/peer/shares/:groupNo
   * 查询群内其他节点共享的资源索引(直接查 tracker)
   */
  async shares({ params, response }: HttpContext) {
    const client = get_client()
    if (!client) {
      return response.status(400).json(new SResponse({ code: 1, message: 'P2P 未启用' }))
    }
    const groupNo = params.groupNo
    try {
      const list: any[] = await client.listShares(groupNo)
      return response.json(new ListResponse({ code: 0, message: '', list, count: list.length }))
    } catch (e: any) {
      log_p2p_error('peer.shares', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.response?.data?.message || e?.message || '查询失败' }))
    }
  }

  /**
   * GET /api/p2p/peer/cache/:groupNo
   * 仅从本地缓存读取
   */
  async cache({ params, response }: HttpContext) {
    const groupNo = params.groupNo
    const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
    if (!group) {
      return response.json(new ListResponse({ code: 0, message: '', list: [], count: 0 }))
    }
    const list = await prisma.p2p_peer_cache.findMany({
      where: { p2pGroupId: group.p2pGroupId },
      orderBy: { lastSeen: 'desc' },
    })
    return response.json(new ListResponse({ code: 0, message: '', list, count: list.length }))
  }

  /**
   * GET /api/p2p/peer/manifests/:groupNo?since=&nodeId=&sync=1&fallback=1
   * 拉取 tracker 上的 manifest 摘要列表(支持 since 增量)
   * - sync=1 时同步写入 p2p_peer_share_manifest 本地缓存
   * - fallback=1 时 tracker 不可达自动回落到本地缓存(用于离线展示)
   */
  async manifests({ params, request, response }: HttpContext) {
    const client = get_client()
    const groupNo = params.groupNo
    const { since, nodeId, sync, fallback } = request.only([
      'since', 'nodeId', 'sync', 'fallback',
    ])

    if (!client) {
      // P2P 未启用 → 直接走本地缓存
      return response.json(new SResponse({
        code: 0, message: '', data: await this._readLocalManifests(groupNo, nodeId, since),
      }))
    }

    try {
      const result = await client.listManifests(groupNo, {
        since: since ? Number(since) : undefined,
        nodeId: nodeId || undefined,
      })

      // 同步到 p2p_peer_share_manifest 缓存(默认开启,与 syncGroup 路径一致)
      if (sync !== '0' && sync !== false) {
        await this._writeLocalManifests(groupNo, result.list || [])
      }

      return response.json(new SResponse({ code: 0, message: '', data: result }))
    } catch (e: any) {
      log_p2p_error('peer.manifests', e)

      // tracker 不可达且开启 fallback → 走本地缓存
      if (fallback) {
        return response.json(new SResponse({
          code: 0,
          message: 'fallback to local cache',
          data: await this._readLocalManifests(groupNo, nodeId, since),
        }))
      }
      return response.status(500).json(
        new SResponse({ code: 1, message: e?.response?.data?.message || e?.message || '查询失败' })
      )
    }
  }

  /** 从本地 p2p_peer_share_manifest 读取摘要列表 */
  private async _readLocalManifests(
    groupNo: string,
    nodeId?: string,
    since?: string | number
  ) {
    const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
    if (!group) return { list: [], count: 0, serverTime: Date.now() }

    const where: any = { p2pGroupId: group.p2pGroupId }
    if (nodeId) where.ownerNodeId = nodeId
    if (since && Number(since) > 0) {
      where.updateTime = { gt: new Date(Number(since)) }
    }

    const rows = await prisma.p2p_peer_share_manifest.findMany({
      where,
      orderBy: { updateTime: 'desc' },
    })
    const list = rows.map((r) => ({
      p2pPeerShareManifestId: r.p2pPeerShareManifestId,
      nodeId: r.ownerNodeId,
      nodeName: null as string | null,
      online: 0,
      shareType: r.shareType,
      remoteMediaId: r.remoteMediaId,
      remoteMangaId: r.remoteMangaId,
      version: Number(r.version),
      contentHash: r.contentHash,
      payloadTruncated: r.payloadTruncated,
      payloadSize: 0,
      shareName: r.shareName,
      coverUrl: r.coverUrl,
      coverSize: null as number | null,
      describe: r.describe,
      mangaCount: r.mangaCount,
      chapterCount: r.chapterCount,
      totalSize: r.totalSize !== null ? r.totalSize.toString() : null,
      updateTime: r.updateTime.getTime(),
    }))
    return { list, count: list.length, serverTime: Date.now() }
  }

  /** 将 tracker 摘要写入本地 p2p_peer_share_manifest 缓存 */
  private async _writeLocalManifests(groupNo: string, items: any[]) {
    if (!items.length) return
    const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
    if (!group) return
    for (const m of items) {
      try {
        await prisma.p2p_peer_share_manifest.upsert({
          where: {
            uniquePeerShareManifest: {
              p2pGroupId: group.p2pGroupId,
              ownerNodeId: m.nodeId,
              shareType: m.shareType,
              remoteMediaId: m.remoteMediaId,
              remoteMangaId: m.remoteMangaId,
            },
          } as any,
          update: {
            version: BigInt(m.version),
            contentHash: m.contentHash,
            payloadTruncated: m.payloadTruncated,
            shareName: m.shareName,
            coverUrl: m.coverUrl,
            describe: m.describe,
            mangaCount: m.mangaCount,
            chapterCount: m.chapterCount,
            totalSize: m.totalSize !== null ? BigInt(m.totalSize) : null,
          },
          create: {
            p2pGroupId: group.p2pGroupId,
            ownerNodeId: m.nodeId,
            shareType: m.shareType,
            remoteMediaId: m.remoteMediaId,
            remoteMangaId: m.remoteMangaId,
            version: BigInt(m.version),
            contentHash: m.contentHash,
            payloadTruncated: m.payloadTruncated,
            shareName: m.shareName,
            coverUrl: m.coverUrl,
            describe: m.describe,
            mangaCount: m.mangaCount,
            chapterCount: m.chapterCount,
            totalSize: m.totalSize !== null ? BigInt(m.totalSize) : null,
          },
        })
      } catch {
        // 单条失败不阻塞
      }
    }
  }

  /**
   * GET /api/p2p/peer/manifest/:groupNo?nodeId=&shareType=&remoteMediaId=&remoteMangaId=
   * 拉取单个 manifest 完整 payload
   */
  async manifest({ params, request, response }: HttpContext) {
    const client = get_client()
    if (!client) {
      return response.status(400).json(new SResponse({ code: 1, message: 'P2P 未启用' }))
    }
    const groupNo = params.groupNo
    const { nodeId, shareType, remoteMediaId, remoteMangaId } = request.only([
      'nodeId', 'shareType', 'remoteMediaId', 'remoteMangaId',
    ])
    if (!nodeId || !shareType) {
      return response.status(400).json(new SResponse({ code: 1, message: 'nodeId 和 shareType 必填' }))
    }

    try {
      const data = await client.getManifest(groupNo, {
        nodeId,
        shareType,
        remoteMediaId: remoteMediaId ? Number(remoteMediaId) : null,
        remoteMangaId: remoteMangaId ? Number(remoteMangaId) : null,
      })
      return response.json(new SResponse({ code: 0, message: '', data }))
    } catch (e: any) {
      log_p2p_error('peer.manifest', e)
      return response.status(500).json(
        new SResponse({ code: 1, message: e?.response?.data?.message || e?.message || '查询失败' })
      )
    }
  }

  /**
   * GET /api/p2p/peer/manifest/:groupNo/manga-tree?remoteMangaId=
   * 当 manifest payload 被截断时,前端按需拉取指定 manga 的文件树
   * 内部: discoverSeeds(shareType=manga) → fetchMangaTree(seeds)
   */
  async mangaTree({ params, request, response }: HttpContext) {
    try {
      const groupNo = params.groupNo
      const remoteMangaId = Number(request.input('remoteMangaId'))
      if (!remoteMangaId) {
        return response.status(400).json(new SResponse({ code: 1, message: 'remoteMangaId 必填' }))
      }

      const seeds = await discoverSeeds({
        groupNo,
        shareType: 'manga',
        remoteMangaId,
      })
      if (!seeds.length) {
        return response.status(404).json(
          new SResponse({ code: 1, message: '未发现可用 seed' })
        )
      }

      const headers = buildHeaders(groupNo)
      const data = await fetchMangaTree(seeds, headers, 'peer.manga-tree', remoteMangaId)
      return response.json(new SResponse({ code: 0, message: '', data }))
    } catch (e: any) {
      log_p2p_error('peer.manga-tree', e)
      return response.status(500).json(
        new SResponse({ code: 1, message: e?.response?.data?.message || e?.message || '获取失败' })
      )
    }
  }

  /**
   * GET /api/p2p/peer/manifest/:groupNo/chapter-tree?remoteMangaId=&remoteChapterId=
   * 按需拉取指定 chapter 的文件树
   * 注: remoteChapterId 是 seed 视角的本地 chapterId,通过 seed 的 /p2p/serve/chapter/:id/tree 获取
   */
  async chapterTree({ params, request, response }: HttpContext) {
    try {
      const groupNo = params.groupNo
      const remoteMangaId = Number(request.input('remoteMangaId'))
      const remoteChapterId = Number(request.input('remoteChapterId'))
      if (!remoteMangaId || !remoteChapterId) {
        return response.status(400).json(
          new SResponse({ code: 1, message: 'remoteMangaId 和 remoteChapterId 必填' })
        )
      }

      const seeds = await discoverSeeds({
        groupNo,
        shareType: 'manga',
        remoteMangaId,
      })
      if (!seeds.length) {
        return response.status(404).json(
          new SResponse({ code: 1, message: '未发现可用 seed' })
        )
      }

      const headers = buildHeaders(groupNo)
      const data = await fetchChapterTree(seeds, headers, 'peer.chapter-tree', remoteChapterId)
      return response.json(new SResponse({ code: 0, message: '', data }))
    } catch (e: any) {
      log_p2p_error('peer.chapter-tree', e)
      return response.status(500).json(
        new SResponse({ code: 1, message: e?.response?.data?.message || e?.message || '获取失败' })
      )
    }
  }
}