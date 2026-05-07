/**
 * 拉取媒体库子任务
 *
 * 职责:
 *  1. 调对端 /p2p/serve/media/:id/mangas 获取该媒体库下的全部漫画列表
 *  2. 为每本漫画派生一个 PullMangaSubJob,把它们串行展开(仅限 tree 阶段)
 *     - tree 阶段串行:避免同时对对端发起 N 个 /tree 请求,平滑压力
 *     - 下载阶段并行:所有 FileTask 入同一个 pool,多 seed 多 worker 同时消费
 *
 * 这里的"串行 tree + 并行下载"设计正是方案 B 的核心:子任务只是内存中的逻辑
 * 阶段,不破坏下游多节点并行下载的特性。
 */

import type { IPullSubJob, PullContext } from './pull_context.js'
import { fetchMediaMangas } from './pull_tree_fetcher.js'
import { PullMangaSubJob } from './pull_manga_sub_job.js'

export class PullMediaSubJob implements IPullSubJob {
  readonly name = 'PullMediaSubJob'

  /**
   * @param mediaId   对端媒体库 id
   * @param parentDir 本地父级目录(通常为 ctx.receivedPath)
   */
  constructor(
    private mediaId: number,
    private parentDir: string
  ) {}

  async prepare(ctx: PullContext): Promise<number> {
    if (await ctx.isCanceled()) {
      console.log(`[${ctx.logTag}] ${this.name} 已取消 mediaId=${this.mediaId}`)
      return 0
    }

    console.log(`[${ctx.logTag}] ${this.name} 开始 mediaId=${this.mediaId}`)

    let mangas: any[] = []
    try {
      mangas = await fetchMediaMangas(ctx.seeds, ctx.headers, ctx.logTag, this.mediaId)
    } catch (err: any) {
      // 媒体库列表都拿不到视为致命错误,交由父任务处理
      throw new Error(`获取媒体库漫画列表失败 mediaId=${this.mediaId}: ${err?.message || err}`)
    }

    if (!mangas.length) {
      console.warn(`[${ctx.logTag}] ${this.name} mediaId=${this.mediaId} 漫画列表为空`)
      return 0
    }

    console.log(
      `[${ctx.logTag}] ${this.name} mediaId=${this.mediaId} 共 ${mangas.length} 本漫画,开始逐本展开 tree`
    )

    let total = 0
    for (const m of mangas) {
      if (await ctx.isCanceled()) {
        console.log(`[${ctx.logTag}] ${this.name} 展开过程中检测到取消,中止后续漫画`)
        break
      }
      if (!m?.mangaId) continue
      const mangaJob = new PullMangaSubJob(
        Number(m.mangaId),
        this.parentDir,
        m.mangaName
      )
      total += await mangaJob.prepare(ctx)
    }

    console.log(
      `[${ctx.logTag}] ${this.name} 完成 mediaId=${this.mediaId} 共入池 ${total} 个文件`
    )
    return total
  }
}