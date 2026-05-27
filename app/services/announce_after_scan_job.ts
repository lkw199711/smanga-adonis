import { announceForMedia } from '#services/p2p/p2p_announce_service'

/**
 * 扫描完成后自动触发 announce,更新群组分享的 mangaCount
 */
export default class AnnounceAfterScanJob {
  private mediaId: number

  constructor({ mediaId }: { mediaId: number }) {
    this.mediaId = mediaId
  }

  async run() {
    console.log(`[p2p] AnnounceAfterScanJob started for mediaId=${this.mediaId}`)
    await announceForMedia(this.mediaId)
    console.log(`[p2p] AnnounceAfterScanJob done for mediaId=${this.mediaId}`)
  }
}
