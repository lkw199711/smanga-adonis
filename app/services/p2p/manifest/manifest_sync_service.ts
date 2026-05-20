/**
 * 鑺傜偣绔?manifest 澧為噺鍚屾鏈嶅姟
 *
 * 瑙﹀彂鏃舵満:
 *  - 蹇冭烦鏀跺埌 tracker 鎺ㄩ€佺殑 manifest_changed 閫氱煡
 *  - 鐢ㄦ埛涓诲姩鎵撳紑"鏌ョ湅璇︽儏"瀵硅瘽妗嗗墠(鍒锋柊)
 *
 * 娴佺▼:
 *  1) 鍙栨湰鍦?p2p_peer_share_manifest 涓缇ゆ渶澶?updateTime 浣滀负 since(澧為噺鍩虹嚎)
 *  2) 璋?tracker /tracker/group/:groupNo/manifests?since=...
 *  3) upsert 鍒?p2p_peer_share_manifest
 *
 * 骞跺彂淇濇姢:姣忕兢鍚屾椂鍙湁涓€涓悓姝ヤ换鍔″湪璺?閲嶅瑙﹀彂鐩存帴鍚堝苟
 */

import prisma from '#start/prisma'
import { get_default_tracker_client } from '../tracker_client.js'
import { log_p2p_error, log_p2p_info } from '#utils/p2p_log'

class ManifestSyncService {
  /** 姣忕兢鍦ㄨ窇鐨勫悓姝ヤ换鍔?(groupNo 鈫?Promise) */
  private inflight = new Map<string, Promise<void>>()

  /**
   * 鍚屾鎸囧畾缇ょ殑 manifest 鎽樿鍒版湰鍦扮紦瀛?
   * - 鏈変换鍔″湪璺戝垯鐩存帴澶嶇敤,涓嶉噸澶嶈Е鍙?
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

    // 鍙栨湰鍦扮紦瀛樹腑璇ョ兢鏈€澶?updateTime 浣滀负 since(姣鏃堕棿鎴?
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
      log_p2p_error('manifest.sync.fetch', e)
      if (process.env.P2P_DEBUG) {
      }
      return
    }

    if (!result?.list?.length) return

    let upserted = 0
    let failed = 0
    for (const m of result.list) {
      try {
        await prisma.p2p_peer_share_manifest.upsert({
          where: {
            // 娉? schema 涓?@@unique([...], map: "uniquePeerShareManifest")
            // map 浠呬綔涓烘暟鎹簱绱㈠紩鍚?Prisma Client 瀹為檯澶嶅悎閿悕鎸夊瓧娈靛悕鎷兼帴
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
        failed++
        // 鍗曟潯澶辫触涓嶅奖鍝嶆暣浣?
      }
    }

    if (failed > 0) {
      log_p2p_info('manifest.sync.partial_failed', {
        groupNo,
        fetched: result.list.length,
        upserted,
        failed,
        since,
      })
    }

    if (upserted > 0) {
      log_p2p_info('manifest.sync.completed', {
        groupNo,
        upserted,
        since,
      })
    }
  }
}

export default new ManifestSyncService()
