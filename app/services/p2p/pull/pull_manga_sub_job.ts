/**
 * 拉取单本漫画 Bull Job(C 方案:独立 Bull 任务 + 派生子任务)
 *
 * command: 'taskP2PPullManga'
 *
 * args:
 *  - transferId:   父 p2p_transfer 主键
 *  - groupNo:      群号
 *  - mangaId:      对端漫画 id
 *  - parentDir:    本地父级目录(单 manga 入口=receivedPath;media 展开=receivedPath)
 *  - fallbackName: 外层已知的漫画名(无 tree 时兜底)
 *  - isSubTask:    true=作为 media 父任务的子任务(完成后 notifyDone);false=独立 manga 任务
 *
 * 行为:
 *  1. 发现 seeds(manga 维度)
 *  2. fetch manga tree 一次性拿到所有文件清单
 *  3. 单文件漫画(xxx.zip)→ 直接在本 Job 内用小池拉完,不再拆子任务
 *  4. 目录漫画:
 *     - 从 manga tree 里筛出"元数据文件"(.smanga/、series.json、ComicInfo.xml、cover.*)
 *     - 调 /manga/:id/chapters 拿章节列表
 *     - initTracker(expectedTotal = 1 meta + N 章节)
 *     - addTask('taskP2PPullMeta') × 1(元数据)
 *     - addTask('taskP2PPullChapter') × N(每个章节)
 *     - 本 Job 到此返回(Bull Job 完成),后续由各子 Job 完成时通过 tracker 聚合父状态
 *  5. 作为 media 子任务(isSubTask=true)时:
 *     - 单文件漫画:下载完自己调 notifyDone(transferId)
 *     - 目录漫画:先调 transferSelfToChildren(transferId, 1+chapters.length) 扩展父 tracker 预期,
 *       再派发 meta/chapter 子任务,本 Job 返回;后续由子 Job notifyDone 聚合。
 *
 * ⚠️ tracker 扁平化方案:
 *  - 只使用一个 tracker(绑定顶层 transferId),不嵌套。
 *  - MediaJob 的 init expected = N_mangas,MangaJob 拆分时 transferSelfToChildren(1+chapters)
 *    动态扩展,最终 expected = Σ (1+chapters_i)。
 *  - 所有终端子任务(MetaJob/ChapterJob/单文件 MangaJob)统一 notifyDone 同一个 transferId。
 */

import path from 'path'
import prisma from '#start/prisma'
import { addTask } from '#services/queue_service'
import { TaskPriority } from '../../../type/index.js'
import { fetchMangaTree } from './pull_tree_fetcher.js'
import {
  safeName,
  type TreeResponseData,
  type TreeFileEntry,
  type Seed,
} from './pull_context.js'
import {
  ensureDir,
  isTransferCanceled,
  createThrottledProgressReporter,
  runChildDownload,
  buildHeaders,
  resolveSeeds,
} from './pull_shared.js'
import { initTracker, notifyDone, transferSelfToChildren } from './pull_child_tracker.js'
import { isMetaFile } from './pull_meta_sub_job.js'

export type PullMangaJobArgs = {
  transferId: number
  groupNo: string
  mangaId: number
  parentDir: string
  fallbackName?: string
  isSubTask?: boolean
  /** 上游已发现的 seeds(优先复用,避免重复查 tracker) */
  inheritedSeeds?: Seed[]
}

export default class PullMangaJob {
  private args: PullMangaJobArgs

  constructor(args: PullMangaJobArgs) {
    this.args = args
  }

  async run(): Promise<void> {
    const { transferId, mangaId, groupNo, parentDir, fallbackName, isSubTask, inheritedSeeds } = this.args
    const logTag = `p2p-pull-manga#${transferId}-m${mangaId}`

    if (await isTransferCanceled(transferId)) {
      console.log(`[${logTag}] 已取消,跳过`)
      if (isSubTask) {
        // 作为 media 子任务:需把"未派发出去的子任务"计数补回(否则 media tracker 永远等不到足额)
        // 简化处理:notifyDone 一次表示本 MangaJob 自己的入口位,MediaJob 需要把每个 manga
        // 的 expectedTotal 预留 1 个"manga 自身位" → 见 MediaJob
        await notifyDone(transferId, { ok: false, downloadedBytes: 0, canceled: true })
      }
      return
    }

    console.log(`[${logTag}] 开始 mangaId=${mangaId} parentDir=${parentDir}`)

    let tree: TreeResponseData
    // 解析后的 seeds 在后续派发 Meta/Chapter 子任务时复用,避免每个子任务都去查 tracker
    let resolvedSeeds: Seed[] = []
    try {
      const headers = buildHeaders(groupNo)
      resolvedSeeds = await resolveSeeds(
        inheritedSeeds,
        {
          groupNo,
          shareType: 'manga',
          remoteMangaId: mangaId,
        },
        logTag
      )
      if (!resolvedSeeds.length) throw new Error('群组内未发现该资源的可用节点 (seeds 列表为空)')
      tree = await fetchMangaTree(resolvedSeeds, headers, logTag, mangaId)
    } catch (e: any) {
      const errorMsg = e?.message || String(e)
      console.error(`[${logTag}] 获取 tree 失败: ${errorMsg}`)
      if (isSubTask) {
        await notifyDone(transferId, { ok: false, downloadedBytes: 0, error: errorMsg })
      } else {
        await this.failStandalone(transferId, errorMsg)
      }
      return
    }

    if (!tree || !tree.files?.length) {
      console.warn(`[${logTag}] tree 为空`)
      if (isSubTask) {
        await notifyDone(transferId, { ok: true, downloadedBytes: 0 })
      } else {
        await this.finalizeStandalone(transferId, true, 0)
      }
      return
    }

    const mangaName = safeName(tree.mangaName || fallbackName || `manga_${mangaId}`)
    const baseDir = tree.isSingleFile ? parentDir : path.join(parentDir, mangaName)
    ensureDir(baseDir)

    // 分支 1:单文件漫画,直接在本 Job 内拉完,不拆子任务
    if (tree.isSingleFile) {
      await this.handleSingleFile(tree, baseDir, logTag, isSubTask, resolvedSeeds)
      return
    }

    // 分支 2:目录漫画 → 拆 Meta + Chapters 子任务
    await this.handleDirectoryManga(tree, mangaId, baseDir, logTag, isSubTask, resolvedSeeds)
  }

  /** 单文件漫画:直接起小池拉完(主文件 + sideFiles 一起下) */
  private async handleSingleFile(
    tree: TreeResponseData,
    baseDir: string,
    logTag: string,
    isSubTask: boolean | undefined,
    resolvedSeeds: Seed[]
  ): Promise<void> {
    const { transferId, groupNo, mangaId, parentDir } = this.args
    const reporter = createThrottledProgressReporter(transferId)
    let downloadedBytes = 0
    let ok = true
    let errorMsg: string | undefined

    try {
      const { treeFilesToTasks } = await import('./pull_context.js')
      // 主文件:落到 baseDir(单文件场景 baseDir == parentDir,relPath = basename)
      const mainTasks = treeFilesToTasks(tree.files, baseDir)
      // sideFiles:落到 parentDir(漫画父目录),relPath 已是相对父目录的路径
      const sideTasks =
        tree.sideFiles && tree.sideFiles.length
          ? treeFilesToTasks(tree.sideFiles, parentDir)
          : []
      const tasks = [...mainTasks, ...sideTasks]
      downloadedBytes = await runChildDownload({
        transferId,
        groupNo,
        discoverArgs: { groupNo, shareType: 'manga', remoteMangaId: mangaId },
        inheritedSeeds: resolvedSeeds,
        tasks,
        logTag,
        reporter,
      })
      console.log(
        `[${logTag}] (单文件) 完成 main=${mainTasks.length} side=${sideTasks.length} bytes=${downloadedBytes}`
      )
    } catch (e: any) {
      ok = false
      errorMsg = e?.message || String(e)
      console.error(`[${logTag}] (单文件) 失败: ${errorMsg}`)
      await reporter.flush().catch(() => {})
    }

    if (isSubTask) {
      await notifyDone(transferId, { ok, downloadedBytes, error: errorMsg })
    } else {
      await this.finalizeStandalone(transferId, ok, downloadedBytes, errorMsg)
    }
  }

  /** 目录漫画:拆 Meta + 每个 chapter 为独立 Bull 子任务 */
  private async handleDirectoryManga(
    tree: TreeResponseData,
    mangaId: number,
    baseDir: string,
    logTag: string,
    isSubTask: boolean | undefined,
    resolvedSeeds: Seed[]
  ): Promise<void> {
    const { transferId, groupNo, parentDir } = this.args

    // 1) 拿章节列表(复用已发现的 seeds)
    let chapters: Array<{ chapterId: number; chapterName: string; chapterPath?: string }> = []
    try {
      chapters = await this.fetchChapters(groupNo, mangaId, logTag, resolvedSeeds)
    } catch (e: any) {
      const errorMsg = e?.message || String(e)
      console.error(`[${logTag}] 获取 chapters 失败: ${errorMsg}`)
      if (isSubTask) {
        await notifyDone(transferId, { ok: false, downloadedBytes: 0, error: errorMsg })
      } else {
        await this.failStandalone(transferId, errorMsg)
      }
      return
    }

    // 2) 从 tree.files 里筛元数据(.smanga/、series.json、根目录封面等)
    const metaFiles: TreeFileEntry[] = tree.files.filter((f) => isMetaFile(f.relPath))
    // sideFiles 由 MetaJob 一并下载(漫画同级外置封面 / smanga-info / 章节同级外置封面)
    const sideFiles: TreeFileEntry[] = tree.sideFiles || []

    // 3) 计算 expectedTotal = 1(meta) + chapters.length
    const expectedTotal = 1 + chapters.length

    // 4) 独立任务(isSubTask=false):本 transferId 就是父,需要 initTracker
    //    作为 media 子任务(isSubTask=true):父 tracker 已由 MediaJob init 过,
    //    此处调用 transferSelfToChildren 把"本 MangaJob 的 1 个预期位"替换为 expectedTotal 个
    if (!isSubTask) {
      initTracker(transferId, expectedTotal, Number(tree.totalBytes || 0))
    } else {
      await transferSelfToChildren(transferId, expectedTotal)
    }

    // 5) 派发 MetaJob(透传已发现的 seeds + sideFiles)
    //    sideFiles 的 relPath 以 parentDir 为根,所以 sideBaseDir = parentDir
    await addTask({
      taskName: `p2p-pull-meta-${mangaId}`,
      command: 'taskP2PPullMeta',
      args: {
        transferId,
        groupNo,
        mangaId,
        files: metaFiles,
        baseDir,
        sideFiles,
        sideBaseDir: parentDir,
        isSubTask: true,
        inheritedSeeds: resolvedSeeds,
      },
      priority: TaskPriority.p2pPullMeta,
    })

    // 6) 为每个 chapter 派发 ChapterJob(透传已发现的 seeds)
    //    单文件章节(.zip/.cbz/.cbr/.rar/.7z/.pdf/.epub):chBaseDir = baseDir,
    //      章节 tree 返回的 relPath = basename(zip),直接落到漫画目录根下,不再套一层
    //    目录型章节:chBaseDir = baseDir/<chapterName>,保留章节文件夹层级
    for (const ch of chapters) {
      const isSingleFileChapter =
        !!ch.chapterPath && /\.(zip|cbz|cbr|rar|7z|pdf|epub)$/i.test(ch.chapterPath)
      const chBaseDir = isSingleFileChapter
        ? baseDir
        : path.join(baseDir, safeName(ch.chapterName || `chapter_${ch.chapterId}`))
      await addTask({
        taskName: `p2p-pull-chapter-${ch.chapterId}`,
        command: 'taskP2PPullChapter',
        args: {
          transferId,
          groupNo,
          chapterId: ch.chapterId,
          baseDir: chBaseDir,
          mangaId,
          isSubTask: true,
          inheritedSeeds: resolvedSeeds,
        },
        priority: TaskPriority.p2pPullChapter,
      })
    }

    console.log(
      `[${logTag}] 已派发 ${expectedTotal} 个子任务 (1 meta + ${chapters.length} chapters)`
    )

    // 7) MangaJob 到此返回。真正的完成由各子 Job 通过 tracker 聚合父 transfer 状态
    //    作为 media 子任务时:MangaJob 本身不通知 tracker(expectedTotal 已包含 meta+chapters)
  }

  private async fetchChapters(
    groupNo: string,
    mangaId: number,
    logTag: string,
    inheritedSeeds?: Seed[]
  ): Promise<Array<{ chapterId: number; chapterName: string; chapterPath?: string }>> {
    const { withSeedFailover } = await import('./pull_tree_fetcher.js')
    const axios = (await import('axios')).default

    const headers = buildHeaders(groupNo)
    const seeds = await resolveSeeds(
      inheritedSeeds,
      {
        groupNo,
        shareType: 'manga',
        remoteMangaId: mangaId,
      },
      logTag
    )
    if (!seeds.length) throw new Error('获取 chapters 时 seeds 为空')

    return withSeedFailover(seeds, `获取章节列表 (mangaId=${mangaId})`, logTag, async (seed) => {
      const url = `${seed.baseUrl}/p2p/serve/manga/${mangaId}/chapters`
      const res = await axios.get(url, { headers, timeout: 30 * 1000 })
      return (res.data?.list ?? []) as Array<{
        chapterId: number
        chapterName: string
        chapterPath?: string
      }>
    })
  }

  private async failStandalone(transferId: number, msg: string) {
    await prisma.p2p_transfer
      .update({
        where: { p2pTransferId: transferId },
        data: { status: 'failed', error: msg, endTime: new Date(), speedBps: 0 },
      })
      .catch(() => {})
  }

  private async finalizeStandalone(
    transferId: number,
    ok: boolean,
    _downloadedBytes: number,
    errorMsg?: string
  ) {
    const tag = `p2p-pull-manga#${transferId}`
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