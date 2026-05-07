/**
 * 拉取元数据 Bull Job(C 方案:独立 Bull 任务)
 *
 * command: 'taskP2PPullMeta'
 *
 * args:
 *  - transferId:   父 p2p_transfer 主键
 *  - groupNo:      群号
 *  - mangaId:      所属漫画 id(用于 seeds 发现)
 *  - files:        由父 MangaJob 已筛好的元数据文件清单(TreeFileEntry[])
 *  - baseDir:      本地保存目录(与漫画主体一致,不套层)
 *  - isSubTask:    true=父任务的子任务(完成后 notifyDone);false=独立任务(罕见)
 *
 * 设计要点:
 *  - 本 Job 不自己 fetch tree(由父 MangaJob 已拉过并按元数据规则筛好传入),避免重复请求
 *  - 但仍独立发现 seeds 并起小下载池,保留多 seed 并行能力
 */

import prisma from '#start/prisma'
import { treeFilesToTasks, type TreeFileEntry, type Seed } from './pull_context.js'
import {
  ensureDir,
  isTransferCanceled,
  createThrottledProgressReporter,
  runChildDownload,
} from './pull_shared.js'
import { notifyDone } from './pull_child_tracker.js'

/** 判断 relPath 是否为元数据文件 */
export function isMetaFile(relPath: string): boolean {
  if (!relPath) return false
  const rel = relPath.replace(/\\/g, '/').toLowerCase()

  // .smanga/ 目录下全部视为元数据
  if (rel.startsWith('.smanga/') || rel === '.smanga') return true

  const base = rel.split('/').pop() || ''

  // 根目录通用元数据
  if (base === 'series.json') return true
  if (base === 'comicinfo.xml') return true

  // cover.jpg / cover.png / cover.webp 等(仅根目录那一份)
  if (/^cover\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(base) && !rel.includes('/')) {
    return true
  }

  return false
}

export type PullMetaJobArgs = {
  transferId: number
  groupNo: string
  mangaId: number
  files: TreeFileEntry[]
  baseDir: string
  isSubTask?: boolean
  /** 上游已发现的 seeds(优先复用,避免重复查 tracker) */
  inheritedSeeds?: Seed[]
}

export default class PullMetaJob {
  private args: PullMetaJobArgs

  constructor(args: PullMetaJobArgs) {
    this.args = args
  }

  async run(): Promise<void> {
    const { transferId, mangaId, groupNo, files, baseDir, isSubTask, inheritedSeeds } = this.args
    const logTag = `p2p-pull-meta#${transferId}-m${mangaId}`

    if (await isTransferCanceled(transferId)) {
      console.log(`[${logTag}] 已取消,跳过`)
      if (isSubTask) {
        await notifyDone(transferId, { ok: false, downloadedBytes: 0, canceled: true })
      }
      return
    }

    // 空清单直接视为成功(常见于单文件漫画)
    if (!files || !files.length) {
      console.log(`[${logTag}] 元数据文件清单为空,直接完成`)
      if (isSubTask) {
        await notifyDone(transferId, { ok: true, downloadedBytes: 0 })
      } else {
        await this.finalizeStandalone(transferId, true, 0)
      }
      return
    }

    console.log(`[${logTag}] 开始 files=${files.length} baseDir=${baseDir}`)
    ensureDir(baseDir)

    const reporter = createThrottledProgressReporter(transferId)
    let downloadedBytes = 0
    let ok = true
    let errorMsg: string | undefined

    try {
      const tasks = treeFilesToTasks(files, baseDir)
      downloadedBytes = await runChildDownload({
        transferId,
        groupNo,
        discoverArgs: {
          groupNo,
          shareType: 'manga',
          remoteMangaId: mangaId,
        },
        inheritedSeeds,
        tasks,
        logTag,
        reporter,
      })
      console.log(`[${logTag}] 完成 bytes=${downloadedBytes}`)
    } catch (e: any) {
      ok = false
      errorMsg = e?.message || String(e)
      console.error(`[${logTag}] 失败: ${errorMsg}`)
      await reporter.flush().catch(() => {})
    }

    if (isSubTask) {
      await notifyDone(transferId, { ok, downloadedBytes, error: errorMsg })
    } else {
      await this.finalizeStandalone(transferId, ok, downloadedBytes, errorMsg)
    }
  }

  private async finalizeStandalone(
    transferId: number,
    ok: boolean,
    _downloadedBytes: number,
    errorMsg?: string
  ) {
    const tag = `p2p-pull-meta#${transferId}`
    try {
      const cur = await prisma.p2p_transfer.findUnique({
        where: { p2pTransferId: transferId },
        select: { status: true },
      })
      const isCanceled = cur?.status === 'canceled'

      await prisma.p2p_transfer.update({
        where: { p2pTransferId: transferId },
        data: {
          status: isCanceled ? 'canceled' : ok ? 'success' : 'failed',
          progress: ok && !isCanceled ? 100 : undefined,
          error: ok ? null : errorMsg || 'unknown error',
          endTime: new Date(),
          speedBps: 0,
        },
      })
    } catch (e: any) {
      console.warn(`[${tag}] finalize 失败: ${e?.message || e}`)
    }
  }
}