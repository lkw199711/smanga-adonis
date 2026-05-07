/**
 * 拉取单本漫画子任务
 *
 * 职责:
 *  1. 调对端 /p2p/serve/manga/:id/tree 一次性获取该漫画下所有文件清单
 *     (服务端已返回包含 .smanga/ 元数据在内的完整列表,无需再发独立元数据请求)
 *  2. 决定本地 baseDir:
 *     - tree.isSingleFile=true  → 单文件漫画(xxx.zip),直接保存到 parentDir/
 *     - tree.isSingleFile=false → 目录漫画,套一层 mangaName/ 保证漫画名不丢失
 *  3. 派生 PullMetaSubJob 处理元数据文件(.smanga/、series.json 等)
 *  4. 把剩余"漫画正文"文件(排除元数据)入 ctx.pool
 *
 * 为什么元数据与正文都进同一个 pool:
 *  - 保持多节点并行下载特性(多 seed = 多 worker)
 *  - 只是作为"逻辑分组"让日志更清晰,文件本身不做优先级区分
 *
 * 关于"章节子任务"拆分:
 *  manga 的 tree 接口一次返回所有文件(含全部章节目录),再按章节拆单独调 tree
 *  会导致 N 次额外 HTTP 请求且服务端需要额外改造,性价比不高。本实现采用
 *  "单次 tree + 内存分组"策略:元数据走 MetaSubJob,其余文件直接入池。
 *  真正的 transferType='chapter' 入口仍走 PullChapterSubJob,保持独立拉单章节的能力。
 */

import path from 'path'
import type { IPullSubJob, PullContext, TreeResponseData } from './pull_context.js'
import { treeToFileTasks, safeName, enqueueTasks } from './pull_context.js'
import { fetchMangaTree } from './pull_tree_fetcher.js'
import { PullMetaSubJob, isMetaFile } from './pull_meta_sub_job.js'

export class PullMangaSubJob implements IPullSubJob {
  readonly name = 'PullMangaSubJob'

  /**
   * @param mangaId   对端漫画 id
   * @param parentDir 本地父级目录(媒体库拉取时由 MediaSubJob 传 receivedPath)
   * @param fallbackName 外层已知的漫画名(tree 无返回时使用)
   */
  constructor(
    private mangaId: number,
    private parentDir: string,
    private fallbackName?: string
  ) {}

  async prepare(ctx: PullContext): Promise<number> {
    if (await ctx.isCanceled()) {
      console.log(`[${ctx.logTag}] ${this.name} 已取消 mangaId=${this.mangaId}`)
      return 0
    }

    console.log(`[${ctx.logTag}] ${this.name} 开始 mangaId=${this.mangaId}`)

    let tree: TreeResponseData
    try {
      tree = await fetchMangaTree(ctx.seeds, ctx.headers, ctx.logTag, this.mangaId)
    } catch (err: any) {
      // 媒体库批量拉取时,允许单本失败不中断整体
      console.warn(
        `[${ctx.logTag}] ${this.name} 获取 tree 失败 mangaId=${this.mangaId}: ${err?.message || err},跳过本漫画`
      )
      return 0
    }

    if (!tree || !tree.files?.length) {
      console.warn(`[${ctx.logTag}] ${this.name} tree 为空 mangaId=${this.mangaId}`)
      return 0
    }

    const mangaName = safeName(tree.mangaName || this.fallbackName || `manga_${this.mangaId}`)
    const baseDir = tree.isSingleFile
      ? this.parentDir
      : path.join(this.parentDir, mangaName)

    let total = 0

    // 1) 元数据子任务(目录漫画才有意义)
    if (!tree.isSingleFile) {
      const metaJob = new PullMetaSubJob(tree, baseDir)
      total += await metaJob.prepare(ctx)
    }

    // 2) 漫画正文:元数据之外的所有文件
    //    单文件漫画:tree.files 只有一个文件,itself 就是正文,整个入池
    const bodyFilter = tree.isSingleFile
      ? undefined
      : (rel: string) => !isMetaFile(rel)

    const bodyTasks = treeToFileTasks(tree, baseDir, bodyFilter)
    if (bodyTasks.length > 0) {
      enqueueTasks(ctx, bodyTasks)
      const bytes = bodyTasks.reduce((a, t) => a + (t.size || 0), 0)
      console.log(
        `[${ctx.logTag}] ${this.name} 正文入池 mangaId=${this.mangaId} name=${mangaName} ` +
        `singleFile=${tree.isSingleFile} files=${bodyTasks.length} bytes=${bytes} baseDir=${baseDir}`
      )
      total += bodyTasks.length
    } else if (!tree.isSingleFile) {
      console.warn(
        `[${ctx.logTag}] ${this.name} 正文为空(仅元数据?) mangaId=${this.mangaId} name=${mangaName}`
      )
    }

    console.log(
      `[${ctx.logTag}] ${this.name} 完成 mangaId=${this.mangaId} 共入池 ${total} 个文件`
    )
    return total
  }
}