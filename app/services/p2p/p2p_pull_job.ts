/**
 * P2P 鎷夊彇浠诲姟鍏ュ彛鍒嗗彂鍣?C 鏂规)
 *
 * 鍘熸潵鐨?P2PPullJob 鏄竴涓?鍗曚綋鐖?Job",鍖呭惈 seeds 鍙戠幇 + tree 鎷夊彇 + 涓嬭浇姹犺皟搴?+
 * 钀藉簱鐨勫畬鏁存祦绋嬨€侰 鏂规鎶婂畠鎷嗘垚 4 涓嫭绔嬬殑 Bull Job(media/manga/chapter/meta),
 * 瀹冧滑鍚勮嚜閫氳繃 queueService.addTask 鍏ラ槦鎵ц銆?
 *
 * 鏈枃浠剁幇鍦ㄥ彧鍋氫竴浠朵簨:鏍规嵁 transfer.transferType 鎶婂叆鍙ｄ换鍔¤浆鍙戝埌瀵瑰簲鐨勬柊 Job銆?
 * 淇濈暀鏈枃浠剁殑鐩殑:controller 閲岀殑 addTask('taskP2PPull', {transferId}) 涓嶅彉,
 * 闃熷垪灞備粛鐒惰兘璇嗗埆骞跺垎鍙?閬垮厤涓€娆℃€ф敼鍔?controller + queue_service + 鎵€鏈夎皟鐢ㄧ偣銆?
 *
 * 娉ㄦ剰:鏈?Job 鑷韩鍦ㄥ垎鍙戝畬鎴愬悗绔嬪嵆杩斿洖(涓嶇瓑瀛?Job 瀹屾垚)銆傜湡姝ｇ殑瀹屾垚缁撶畻鐢卞簳灞?
 * 瀛?Job + pull_child_tracker 鑱氬悎璐熻矗銆?
 */

import prisma from '#start/prisma'
import { addTask } from '#services/queue_service'
import { TaskPriority } from '../../type/index.js'
import { log_p2p_error, log_p2p_info } from '#utils/p2p_log'

type P2PPullArgs = {
  transferId: number
}

export default class P2PPullJob {
  private transferId: number

  constructor(args: P2PPullArgs) {
    this.transferId = args.transferId
  }

  async run() {
    log_p2p_info('transfer.dispatch.started', { transferId: this.transferId })

    const transfer = await prisma.p2p_transfer.findUnique({
      where: { p2pTransferId: this.transferId },
    })
    if (!transfer) {
      log_p2p_info('transfer.dispatch.skipped_not_found', { transferId: this.transferId })
      return
    }
    if (transfer.status === 'canceled') {
      log_p2p_info('transfer.dispatch.skipped_canceled', { transferId: this.transferId })
      return
    }
    if (!transfer.groupNo) {
      await this.fail('transfer.groupNo 缂哄け')
      return
    }

    try {
      if (transfer.transferType === 'chapter') {
        if (!transfer.remoteChapterId) throw new Error('remoteChapterId 缂哄け')
        if (!transfer.remoteMangaId) throw new Error('remoteMangaId 缂哄け(绔犺妭闇€瑕佹寜 manga 鍙戠幇 seeds)')
        // 绔犺妭鐙珛鍏ュ彛:璁?ChapterJob 鑷繁瀹屾垚 transfer 钀界姸鎬?闈炲瓙浠诲姟妯″紡)
        await this.markRunning(transfer.p2pTransferId)
        await addTask({
          taskName: `p2p-pull-chapter-${transfer.remoteChapterId}`,
          command: 'taskP2PPullChapter',
          args: {
            transferId: transfer.p2pTransferId,
            groupNo: transfer.groupNo,
            chapterId: transfer.remoteChapterId,
            mangaId: transfer.remoteMangaId,
            baseDir: transfer.receivedPath,
            isSubTask: false,
          },
          priority: TaskPriority.p2pPullChapter,
        })
      } else if (transfer.transferType === 'manga') {
        if (!transfer.remoteMangaId) throw new Error('remoteMangaId 缂哄け')
        await this.markRunning(transfer.p2pTransferId)
        await addTask({
          taskName: `p2p-pull-manga-${transfer.remoteMangaId}`,
          command: 'taskP2PPullManga',
          args: {
            transferId: transfer.p2pTransferId,
            groupNo: transfer.groupNo,
            mangaId: transfer.remoteMangaId,
            parentDir: transfer.receivedPath,
            fallbackName: transfer.remoteName,
            isSubTask: false,
          },
          priority: TaskPriority.p2pPullManga,
        })
      } else if (transfer.transferType === 'media') {
        if (!transfer.remoteMediaId) throw new Error('remoteMediaId 缂哄け')
        // MediaJob 鍐呴儴浼氳嚜琛屾妸 transfer 鍒囨崲鍒?running
        await addTask({
          taskName: `p2p-pull-media-${transfer.remoteMediaId}`,
          command: 'taskP2PPullMedia',
          args: {
            transferId: transfer.p2pTransferId,
            groupNo: transfer.groupNo,
            mediaId: transfer.remoteMediaId,
            parentDir: transfer.receivedPath,
          },
          priority: TaskPriority.p2pPullMedia,
        })
      } else {
        throw new Error(`鏆備笉鏀寔鐨?transferType: ${transfer.transferType}`)
      }

      log_p2p_info('transfer.dispatch.completed', {
        transferId: transfer.p2pTransferId,
        transferType: transfer.transferType,
        groupNo: transfer.groupNo,
      })
    } catch (e: any) {
      const msg = e?.message || String(e)
      log_p2p_error('transfer.dispatch', e)
      await this.fail(msg)
    }
  }

  private async markRunning(transferId: number) {
    await prisma.p2p_transfer
      .update({
        where: { p2pTransferId: transferId },
        data: {
          status: 'running',
          startTime: new Date(),
          progress: 0,
          downloadedBytes: 0n,
          speedBps: 0,
        },
      })
      .catch(() => {})
  }

  private async fail(msg: string) {
    await prisma.p2p_transfer
      .update({
        where: { p2pTransferId: this.transferId },
        data: { status: 'failed', error: msg, endTime: new Date(), speedBps: 0 },
      })
      .catch(() => {})
    log_p2p_info('transfer.dispatch.failed', { transferId: this.transferId, reason: msg })
  }
}
