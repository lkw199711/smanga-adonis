/**
 * P2P 共享 announce 服务
 *
 * 从 p2p_shares_controller.ts 提取,供 controller 和后台 job 共用
 */
import prisma from '#start/prisma'
import { get_config } from '#utils/index'
import TrackerClient from './tracker_client.js'
import p2pIdentityService from './p2p_identity_service.js'
import { log_p2p_error } from '#utils/p2p_log'
import type { AnnouncePayload, AnnounceResult } from '#type/p2p'
import { buildShareManifest } from './manifest/manifest_builder.js'

function get_clients(): TrackerClient[] {
  const cfg = get_config()?.p2p
  if (!cfg?.enable || !cfg?.role?.node) return []

  const id = p2pIdentityService.getIdentity()
  if (!id) return []

  const urls = p2pIdentityService.getReachableTrackerUrls(cfg)
  return urls.map((url) => new TrackerClient(url, id.nodeId))
}

/**
 * 根据本地 p2p_local_share 组装并上报到 tracker
 */
type ShareRecord = {
  p2pLocalShareId: number
  p2pGroupId: number
  shareType: string
  mediaId: number | null
  mangaId: number | null
  shareName: string
  enable: number
}

type ManifestRecord = {
  p2pLocalShareId: number
  version: bigint
  contentHash: string
  payloadSize: number
  payloadTruncated: number
  payload: string | null
  lastAnnounceTime: Date | null
}

export async function announce_group(groupNo: string) {
  try {
    const clients = get_clients()
    if (!clients.length) return
    const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
    if (!group) return
    const shares = await prisma.p2p_local_share.findMany({
      where: { p2pGroupId: group.p2pGroupId, enable: 1 },
    }) as ShareRecord[]

    const localShareIds = shares.map((s: ShareRecord) => s.p2pLocalShareId)
    const cachedManifests = localShareIds.length
      ? await prisma.p2p_local_share_manifest.findMany({
          where: { p2pLocalShareId: { in: localShareIds } },
        }) as ManifestRecord[]
      : []
    const cacheByShareId = new Map(cachedManifests.map((m: ManifestRecord) => [m.p2pLocalShareId, m]))

    type BuiltShare = {
      share: ShareRecord
      mangaCount: number | undefined
      manifest: Awaited<ReturnType<typeof buildShareManifest>>
      changed: boolean
    }

    const built: BuiltShare[] = await Promise.all(
      shares.map(async (s: ShareRecord): Promise<BuiltShare> => {
        let mangaCount: number | undefined
        if (s.shareType === 'media' && s.mediaId) {
          mangaCount = await prisma.manga.count({ where: { mediaId: s.mediaId } })
        }

        const manifest = await buildShareManifest({
          p2pLocalShareId: s.p2pLocalShareId,
          shareType: s.shareType,
          mediaId: s.mediaId,
          mangaId: s.mangaId,
          shareName: s.shareName,
        })

        let changed = false
        if (manifest) {
          const cached = cacheByShareId.get(s.p2pLocalShareId)
          changed = !cached || cached.contentHash !== manifest.contentHash
        }

        return { share: s, mangaCount, manifest, changed }
      })
    )

    const payload: AnnouncePayload = {
      shares: built.map(({ share: s, mangaCount, manifest, changed }) => {
        const item: AnnouncePayload['shares'][number] = {
          shareType: s.shareType,
          remoteMediaId: s.mediaId || undefined,
          remoteMangaId: s.mangaId || undefined,
          shareName: s.shareName,
          mangaCount,
        }
        if (manifest && changed) {
          item.coverUrl = manifest.payload.share.coverUrl || undefined
          item.totalSize = manifest.payload.stats.totalSize
          item.manifest = {
            contentHash: manifest.contentHash,
            payloadSize: manifest.payloadSize,
            payloadTruncated: manifest.payloadTruncated ? 1 : 0,
            payload: manifest.payloadJson,
          }
        }
        return item
      }),
    }

    let result: AnnounceResult | undefined
    let successCount = 0
    for (const c of clients) {
      try {
        const current = (await c.announceShares(groupNo, payload)) as AnnounceResult | undefined
        if (!result && current) result = current
        successCount += 1
      } catch (e: any) {
        log_p2p_error('announce_group.tracker', e)
      }
    }

    if (successCount === 0) {
      throw new Error('announce failed on all trackers')
    }

    const versionByKey = new Map<string, { version: number; contentHash: string }>()
    if (result && Array.isArray(result.shares)) {
      for (const r of result.shares) {
        const k = `${r.shareType}|${r.remoteMediaId ?? ''}|${r.remoteMangaId ?? ''}`
        versionByKey.set(k, { version: Number(r.version), contentHash: r.contentHash })
      }
    }

    for (const { share: s, manifest, changed } of built) {
      if (!manifest || !changed) continue
      const key = `${s.shareType}|${s.mediaId ?? ''}|${s.mangaId ?? ''}`
      const fromTracker = versionByKey.get(key)
      const version = BigInt(fromTracker?.version || Date.now())
      const contentHash = fromTracker?.contentHash || manifest.contentHash

      await prisma.p2p_local_share_manifest.upsert({
        where: { p2pLocalShareId: s.p2pLocalShareId },
        create: {
          p2pLocalShareId: s.p2pLocalShareId,
          version,
          contentHash,
          payloadSize: manifest.payloadSize,
          payloadTruncated: manifest.payloadTruncated ? 1 : 0,
          payload: manifest.payloadJson,
          lastAnnounceTime: new Date(),
        },
        update: {
          version,
          contentHash,
          payloadSize: manifest.payloadSize,
          payloadTruncated: manifest.payloadTruncated ? 1 : 0,
          payload: manifest.payloadJson,
          lastAnnounceTime: new Date(),
        },
      })
    }

    console.log(`[p2p] announce_group(${groupNo}) done`)
  } catch (e: any) {
    log_p2p_error('share.announce', e)
  }
}

/**
 * 扫描完成后触发:查找所有共享了指定媒体库的群组并重新 announce
 */
export async function announceForMedia(mediaId: number) {
  const shares = await prisma.p2p_local_share.findMany({
    where: { mediaId, enable: 1 },
    select: { p2pGroupId: true },
  }) as { p2pGroupId: number }[]
  if (!shares.length) return

  const groupIds = [...new Set(shares.map((s) => s.p2pGroupId))]
  const groups = await prisma.p2p_group.findMany({
    where: { p2pGroupId: { in: groupIds } },
    select: { groupNo: true },
  })

  for (const g of groups) {
    await announce_group(g.groupNo)
  }
  console.log(`[p2p] announceForMedia mediaId=${mediaId} groups=${groups.length}`)
}
