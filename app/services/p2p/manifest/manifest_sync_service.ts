/**
 * 节点端 manifest 增量同步服务
 *
 * 触发时机:
 *  - 心跳收到 tracker 推送的 manifest_changed 通知
 *  - 用户主动打开"查看详情"对话框前(刷新)
 *
 * 流程:
 *  1) 取本地 p2p_peer_share_manifest 中该群最大 updateTime 作为 since(增量基线)
 *  2) 调 tracker /tracker/group/:groupNo/manifests?since=...
 *  3) upsert 到 p2p_peer_share_manifest
 *
 * 并发保护:每群同时只有一个同步任务在跑,重复触发直接合并
 */

import prisma from '#start/prisma'
import { get_default_tracker_client } from '../tracker_client.js'

class ManifestSyncService {
  /** 每群在跑的同步任务 (groupNo → Promise) */
  private inflight = new Map<string, Promise<void>>()

  /**
   * 同步指定群的 manifest 摘要到本地缓存
   * - 有任务在跑则直接复用,不重复触发
   */
  async syncGroup(groupNo: string): Promise<void> {
    const existing = this.inflight.get(groupNo)
    if (existing) return existing

    const p = this._doSync(groupNo).finally(() => {
      this.inflight.delete(groupNo)
    })
    this.inflight.set(groupNo, p)
    return p
  }

  private async _doSync(groupNo: string): Promise<void> {
    const tracker = get_default_tracker_client()
    if (!tracker) return

    const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
    if (!group) return

    // 取本地缓存中该群最大 updateTime 作为 since(毫秒时间戳)
    const lastest = await prisma.p2p_peer_share_manifest.findFirst({
      where: { p2pGroupId: group.p2pGroupId },
      orderBy: { updateTime: 'desc' },
      select: { updateTime: true },
    })
    const since = lastest?.updateTime ? lastest.updateTime.getTime() : 0

    let result
    try {
      result = await tracker.listManifests(groupNo, { since: since > 0 ? since : undefined })
    } catch (e: any) {
      if (process.env.P2P_DEBUG) {
        console.warn(`[p2p] manifest 同步失败 groupNo=${groupNo}`, e?.message)
      }
      return
    }

    if (!result?.list?.length) return

    let upserted = 0
    for (const m of result.list) {
      try {
        await prisma.p2p_peer_share_manifest.upsert({
          where: {
            // 注: schema 中 @@unique([...], map: "uniquePeerShareManifest")
            // map 仅作为数据库索引名;Prisma Client 实际复合键名按字段名拼接
            p2pGroupId_ownerNodeId_shareType_remoteMediaId_remoteMangaId: {
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
        upserted++
      } catch (e: any) {
        // 单条失败不影响整体
        if (process.env.P2P_DEBUG) {
          console.warn(`[p2p] manifest upsert 失败 nodeId=${m.nodeId}`, e?.message)
        }
      }
    }

    console.log(`[p2p] manifest 同步完成 groupNo=${groupNo} upserted=${upserted}`)
  }
}

export default new ManifestSyncService()