import { announceForMedia, announce_group } from '#services/p2p/p2p_announce_service'

/**
 * 扫描完成后自动触发 announce,更新群组分享的 mangaCount
 */
export default class AnnounceAfterScanJob {
  private mediaId?: number
  private groupNo?: string

  constructor({ mediaId, groupNo }: { mediaId?: number; groupNo?: string }) {
    this.mediaId = mediaId
    this.groupNo = groupNo
  }

  async run() {
    console.log(
      `[p2p] AnnounceAfterScanJob started mediaId=${this.mediaId ?? ''} groupNo=${this.groupNo ?? ''}`
    )
    if (this.groupNo) {
      await announce_group(this.groupNo)
    } else if (this.mediaId) {
      await announceForMedia(this.mediaId)
    }
    console.log(
      `[p2p] AnnounceAfterScanJob done mediaId=${this.mediaId ?? ''} groupNo=${this.groupNo ?? ''}`
    )
  }
}
