/**
 * 拉取单个章节子任务
 *
 * 职责:
 *  1. 调对端 /p2p/serve/chapter/:id/tree 获取章节下所有文件清单
 *  2. 把清单转成 FileTask 入 ctx.pool(由父任务统一下载)
 *
 * 落盘规则:
 *  - tree.isSingleFile=true  → 整本章节是单文件(xxx.zip),保存到 baseDir/<basename>
 *  - tree.isSingleFile=false → 章节是目录,保存到 baseDir/ 下(保留子目录结构)
 *
 * 注意:本子任务默认不自动套章节名目录;当外层是 manga 子任务调用时,
 * 由 manga 子任务决定是否再套一层章节名目录。独立使用时(transferType=chapter),
 * 父任务把 ctx.receivedPath 直接作为 baseDir。
 */

import type { IPullSubJob, PullContext } from './pull_context.js'
import { treeToFileTasks, enqueueTasks } from './pull_context.js'
import { fetchChapterTree } from './pull_tree_fetcher.js'

export class PullChapterSubJob implements IPullSubJob {
  readonly name = 'PullChapterSubJob'

  /** @param chapterId 对端章节 id */
  /** @param baseDir   本地保存根目录(文件按 tree.relPath 相对此展开) */
  constructor(
    private chapterId: number,
    private baseDir: string
  ) {}

  async prepare(ctx: PullContext): Promise<number> {
    if (await ctx.isCanceled()) {
      console.log(`[${ctx.logTag}] ${this.name} 已取消 chapterId=${this.chapterId}`)
      return 0
    }

    console.log(`[${ctx.logTag}] ${this.name} 开始 chapterId=${this.chapterId} -> ${this.baseDir}`)

    const tree = await fetchChapterTree(ctx.seeds, ctx.headers, ctx.logTag, this.chapterId)
    if (!tree || !tree.files?.length) {
      console.warn(
        `[${ctx.logTag}] ${this.name} chapterId=${this.chapterId} tree 返回空,跳过`
      )
      return 0
    }

    const tasks = treeToFileTasks(tree, this.baseDir)
    enqueueTasks(ctx, tasks)

    const bytes = tasks.reduce((a, t) => a + (t.size || 0), 0)
    console.log(
      `[${ctx.logTag}] ${this.name} 入池完成 chapterId=${this.chapterId} ` +
      `files=${tasks.length} bytes=${bytes}`
    )
    return tasks.length
  }
}