/**
 * 鎷夊彇鍗曟湰婕敾 Bull Job(C 鏂规:鐙珛 Bull 浠诲姟 + 娲剧敓瀛愪换鍔?
 *
 * command: 'taskP2PPullManga'
 *
 * args:
 *  - transferId:   鐖?p2p_transfer 涓婚敭
 *  - groupNo:      缇ゅ彿
 *  - mangaId:      瀵圭婕敾 id
 *  - parentDir:    鏈湴鐖剁骇鐩綍(鍗?manga 鍏ュ彛=receivedPath;media 灞曞紑=receivedPath)
 *  - fallbackName: 澶栧眰宸茬煡鐨勬极鐢诲悕(鏃?tree 鏃跺厹搴?
 *  - isSubTask:    true=浣滀负 media 鐖朵换鍔＄殑瀛愪换鍔?瀹屾垚鍚?notifyDone);false=鐙珛 manga 浠诲姟
 *
 * 琛屼负:
 *  1. 鍙戠幇 seeds(manga 缁村害)
 *  2. fetch manga tree 涓€娆℃€ф嬁鍒版墍鏈夋枃浠舵竻鍗?
 *  3. 鍗曟枃浠舵极鐢?xxx.zip)鈫?鐩存帴鍦ㄦ湰 Job 鍐呯敤灏忔睜鎷夊畬,涓嶅啀鎷嗗瓙浠诲姟
 *  4. 鐩綍婕敾:
 *     - 浠?manga tree 閲岀瓫鍑?鍏冩暟鎹枃浠?(.smanga/銆乻eries.json銆丆omicInfo.xml銆乧over.*)
 *     - 璋?/manga/:id/chapters 鎷跨珷鑺傚垪琛?
 *     - initTracker(expectedTotal = 1 meta + N 绔犺妭)
 *     - addTask('taskP2PPullMeta') 脳 1(鍏冩暟鎹?
 *     - addTask('taskP2PPullChapter') 脳 N(姣忎釜绔犺妭)
 *     - 鏈?Job 鍒版杩斿洖(Bull Job 瀹屾垚),鍚庣画鐢卞悇瀛?Job 瀹屾垚鏃堕€氳繃 tracker 鑱氬悎鐖剁姸鎬?
 *  5. 浣滀负 media 瀛愪换鍔?isSubTask=true)鏃?
 *     - 鍗曟枃浠舵极鐢?涓嬭浇瀹岃嚜宸辫皟 notifyDone(transferId)
 *     - 鐩綍婕敾:鍏堣皟 transferSelfToChildren(transferId, 1+chapters.length) 鎵╁睍鐖?tracker 棰勬湡,
 *       鍐嶆淳鍙?meta/chapter 瀛愪换鍔?鏈?Job 杩斿洖;鍚庣画鐢卞瓙 Job notifyDone 鑱氬悎銆?
 *
 * 鈿狅笍 tracker 鎵佸钩鍖栨柟妗?
 *  - 鍙娇鐢ㄤ竴涓?tracker(缁戝畾椤跺眰 transferId),涓嶅祵濂椼€?
 *  - MediaJob 鐨?init expected = N_mangas,MangaJob 鎷嗗垎鏃?transferSelfToChildren(1+chapters)
 *    鍔ㄦ€佹墿灞?鏈€缁?expected = 危 (1+chapters_i)銆?
 *  - 鎵€鏈夌粓绔瓙浠诲姟(MetaJob/ChapterJob/鍗曟枃浠?MangaJob)缁熶竴 notifyDone 鍚屼竴涓?transferId銆?
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
import { log_p2p_error, log_p2p_info } from '#utils/p2p_log'

export type PullMangaJobArgs = {
  transferId: number
  groupNo: string
  mangaId: number
  parentDir: string
  fallbackName?: string
  isSubTask?: boolean
  /** 涓婃父宸插彂鐜扮殑 seeds(浼樺厛澶嶇敤,閬垮厤閲嶅鏌?tracker) */
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
      log_p2p_info('pull.manga.skipped_canceled', { transferId, mangaId, groupNo })
      if (isSubTask) {
        // 浣滀负 media 瀛愪换鍔?闇€鎶?鏈淳鍙戝嚭鍘荤殑瀛愪换鍔?璁℃暟琛ュ洖(鍚﹀垯 media tracker 姘歌繙绛変笉鍒拌冻棰?
        // 绠€鍖栧鐞?notifyDone 涓€娆¤〃绀烘湰 MangaJob 鑷繁鐨勫叆鍙ｄ綅,MediaJob 闇€瑕佹妸姣忎釜 manga
        // 鐨?expectedTotal 棰勭暀 1 涓?manga 鑷韩浣? 鈫?瑙?MediaJob
        await notifyDone(transferId, { ok: false, downloadedBytes: 0, canceled: true })
      }
      return
    }

    log_p2p_info('pull.manga.started', { transferId, mangaId, groupNo, parentDir })

    let tree: TreeResponseData
    // 瑙ｆ瀽鍚庣殑 seeds 鍦ㄥ悗缁淳鍙?Meta/Chapter 瀛愪换鍔℃椂澶嶇敤,閬垮厤姣忎釜瀛愪换鍔￠兘鍘绘煡 tracker
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
      if (!resolvedSeeds.length) throw new Error('缇ょ粍鍐呮湭鍙戠幇璇ヨ祫婧愮殑鍙敤鑺傜偣 (seeds 鍒楄〃涓虹┖)')
      tree = await fetchMangaTree(resolvedSeeds, headers, logTag, mangaId)
    } catch (e: any) {
      const errorMsg = e?.message || String(e)
      log_p2p_error('pull.manga.fetch_tree', e)
      if (isSubTask) {
        await notifyDone(transferId, { ok: false, downloadedBytes: 0, error: errorMsg })
      } else {
        await this.failStandalone(transferId, errorMsg)
      }
      return
    }

    if (!tree || !tree.files?.length) {
      log_p2p_info('pull.manga.empty_tree', { transferId, mangaId, groupNo })
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

    // 鍒嗘敮 1:鍗曟枃浠舵极鐢?鐩存帴鍦ㄦ湰 Job 鍐呮媺瀹?涓嶆媶瀛愪换鍔?
    if (tree.isSingleFile) {
      await this.handleSingleFile(tree, baseDir, logTag, isSubTask, resolvedSeeds)
      return
    }

    // 鍒嗘敮 2:鐩綍婕敾 鈫?鎷?Meta + Chapters 瀛愪换鍔?
    await this.handleDirectoryManga(tree, mangaId, baseDir, logTag, isSubTask, resolvedSeeds)
  }

  /** 鍗曟枃浠舵极鐢?鐩存帴璧峰皬姹犳媺瀹?涓绘枃浠?+ sideFiles 涓€璧蜂笅) */
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
      // 涓绘枃浠?钀藉埌 baseDir(鍗曟枃浠跺満鏅?baseDir == parentDir,relPath = basename)
      const mainTasks = treeFilesToTasks(tree.files, baseDir)
      // sideFiles:钀藉埌 parentDir(婕敾鐖剁洰褰?,relPath 宸叉槸鐩稿鐖剁洰褰曠殑璺緞
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
      log_p2p_info('pull.manga.single_file.completed', {
        transferId,
        mangaId,
        groupNo,
        mainCount: mainTasks.length,
        sideCount: sideTasks.length,
        downloadedBytes,
      })
    } catch (e: any) {
      ok = false
      errorMsg = e?.message || String(e)
      log_p2p_error('pull.manga.single_file', e)
      await reporter.flush().catch(() => {})
    }

    if (isSubTask) {
      await notifyDone(transferId, { ok, downloadedBytes, error: errorMsg })
    } else {
      await this.finalizeStandalone(transferId, ok, downloadedBytes, errorMsg)
    }
  }

  /** 鐩綍婕敾:鎷?Meta + 姣忎釜 chapter 涓虹嫭绔?Bull 瀛愪换鍔?*/
  private async handleDirectoryManga(
    tree: TreeResponseData,
    mangaId: number,
    baseDir: string,
    logTag: string,
    isSubTask: boolean | undefined,
    resolvedSeeds: Seed[]
  ): Promise<void> {
    const { transferId, groupNo, parentDir } = this.args

    // 1) 鎷跨珷鑺傚垪琛?澶嶇敤宸插彂鐜扮殑 seeds)
    let chapters: Array<{ chapterId: number; chapterName: string; chapterPath?: string }> = []
    try {
      chapters = await this.fetchChapters(groupNo, mangaId, logTag, resolvedSeeds)
    } catch (e: any) {
      const errorMsg = e?.message || String(e)
      log_p2p_error('pull.manga.fetch_chapters', e)
      if (isSubTask) {
        await notifyDone(transferId, { ok: false, downloadedBytes: 0, error: errorMsg })
      } else {
        await this.failStandalone(transferId, errorMsg)
      }
      return
    }

    // 2) 璁＄畻"绔犺妭鍐呴儴鍓嶇紑闆嗗悎",鐢ㄤ簬鎶婄珷鑺傚唴閮ㄦ枃浠朵粠 metaFiles 涓墧闄?
    //    - 鐩綍鍨嬬珷鑺?鐩稿 mangaPath 鐨勭洰褰曞墠缂€(浠?/ 缁撳熬),鍏朵笅鎵€鏈夋枃浠堕兘褰掔珷鑺?
    //    - 鍗曟枃浠剁珷鑺?zip 绛?:鐩稿 mangaPath 鐨勬枃浠跺悕(绮剧‘鍖归厤)
    //    chapter.chapterPath 鏄粷瀵硅矾寰?浣跨敤 mangaPath 鍋氱浉瀵瑰寲
    const mangaPath = tree.mangaPath || ''
    const chapterDirPrefixes: string[] = []
    const chapterFileExacts: Set<string> = new Set()
    for (const ch of chapters) {
      if (!ch.chapterPath || !mangaPath) continue
      let rel = ''
      try {
        rel = path.relative(mangaPath, ch.chapterPath).split(path.sep).join('/')
      } catch {
        continue
      }
      if (!rel || rel.startsWith('..')) continue
      const isSingleFileChapter = /\.(zip|cbz|cbr|rar|7z|pdf|epub)$/i.test(ch.chapterPath)
      if (isSingleFileChapter) {
        chapterFileExacts.add(rel)
      } else {
        chapterDirPrefixes.push(rel.endsWith('/') ? rel : rel + '/')
      }
    }
    const isInsideAnyChapter = (relPath: string): boolean => {
      const norm = relPath.replace(/\\/g, '/')
      if (chapterFileExacts.has(norm)) return true
      for (const p of chapterDirPrefixes) {
        if (norm.startsWith(p)) return true
      }
      return false
    }

    // 3) 浠?tree.files 閲岀瓫鍑?闈炵珷鑺傚唴閮?鐨勬枃浠?浣滀负 MetaJob 鐨勪笅杞芥竻鍗?
    //    瑕嗙洊鑼冨洿:
    //      - .smanga/* / series.json / ComicInfo.xml / 鏍圭洰褰曞皝闈?
    //      - 绔犺妭鍚岀骇澶栫疆灏侀潰(濡?Vol.1.jpg銆佺01璇?png)
    //      - 婕敾鏍圭洰褰曞叾浠栨暎鏂囦欢(banner銆乫anart 绛?
    //    杩欎簺閮戒笉鍦?chapter.tree 閲?蹇呴』鐢?MangaJob 杩欎竴渚ц礋璐?
    const metaFiles: TreeFileEntry[] = tree.files.filter((f) => !isInsideAnyChapter(f.relPath))
    // sideFiles 鐢?MetaJob 涓€骞朵笅杞?婕敾鍚岀骇澶栫疆灏侀潰 / smanga-info)
    //   娉?瀵圭宸蹭繚璇?sideFiles 涓笉鍚?mangaPath 鍐呴儴鏂囦欢,涓?metaFiles 涓嶄細閲嶅彔
    const sideFiles: TreeFileEntry[] = tree.sideFiles || []

    // 4) 璁＄畻 expectedTotal = 1(meta) + chapters.length
    const expectedTotal = 1 + chapters.length

    // 5) 鐙珛浠诲姟(isSubTask=false):鏈?transferId 灏辨槸鐖?闇€瑕?initTracker
    //    浣滀负 media 瀛愪换鍔?isSubTask=true):鐖?tracker 宸茬敱 MediaJob init 杩?
    //    姝ゅ璋冪敤 transferSelfToChildren 鎶?鏈?MangaJob 鐨?1 涓鏈熶綅"鏇挎崲涓?expectedTotal 涓?
    if (!isSubTask) {
      initTracker(transferId, expectedTotal, Number(tree.totalBytes || 0))
    } else {
      await transferSelfToChildren(transferId, expectedTotal)
    }

    // 6) 娲惧彂 MetaJob(閫忎紶宸插彂鐜扮殑 seeds + sideFiles)
    //    sideFiles 鐨?relPath 浠?parentDir 涓烘牴,鎵€浠?sideBaseDir = parentDir
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

    // 7) 涓烘瘡涓?chapter 娲惧彂 ChapterJob(閫忎紶宸插彂鐜扮殑 seeds)
    //    鍗曟枃浠剁珷鑺?.zip/.cbz/.cbr/.rar/.7z/.pdf/.epub):chBaseDir = baseDir,
    //      绔犺妭 tree 杩斿洖鐨?relPath = basename(zip),鐩存帴钀藉埌婕敾鐩綍鏍逛笅,涓嶅啀濂椾竴灞?
    //    鐩綍鍨嬬珷鑺?chBaseDir = baseDir/<chapterName>,淇濈暀绔犺妭鏂囦欢澶瑰眰绾?
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

    log_p2p_info('pull.manga.dispatched', {
      transferId,
      mangaId,
      groupNo,
      expectedTotal,
      chapterCount: chapters.length,
    })

    // 7) MangaJob 鍒版杩斿洖銆傜湡姝ｇ殑瀹屾垚鐢卞悇瀛?Job 閫氳繃 tracker 鑱氬悎鐖?transfer 鐘舵€?
    //    浣滀负 media 瀛愪换鍔℃椂:MangaJob 鏈韩涓嶉€氱煡 tracker(expectedTotal 宸插寘鍚?meta+chapters)
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
    if (!seeds.length) throw new Error('鑾峰彇 chapters 鏃?seeds 涓虹┖')

    return withSeedFailover(seeds, `鑾峰彇绔犺妭鍒楄〃 (mangaId=${mangaId})`, logTag, async (seed) => {
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
    log_p2p_info('pull.manga.failed', { transferId, reason: msg })
  }

  private async finalizeStandalone(
    transferId: number,
    ok: boolean,
    _downloadedBytes: number,
    errorMsg?: string
  ) {
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
    }
  }
}
