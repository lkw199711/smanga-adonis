/**
 * 拉取元数据目录子任务
 *
 * 职责:
 *  - 从已获取的漫画 tree 中筛出"元数据相关文件"并单独入池
 *  - 目的是让元数据先于/与正文数据一起就绪,前端扫描阶段可尽早拿到封面与信息
 *
 * 识别为元数据的文件(按 relPath 匹配,大小写不敏感):
 *  - `.smanga/`  目录下所有文件(smanga 私有元数据,如封面、标签)
 *  - `series.json`  系列元数据(Kavita/Komga 规范)
 *  - `ComicInfo.xml`  章节/系列内信息(广泛使用)
 *  - `cover.*`  根目录封面
 *
 * 依赖:需要调用方提供已经 fetch 到的 tree(避免重复请求)
 */

import path from 'path'
import type { IPullSubJob, PullContext, TreeResponseData } from './pull_context.js'
import { treeToFileTasks, enqueueTasks } from './pull_context.js'

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

export class PullMetaSubJob implements IPullSubJob {
  readonly name = 'PullMetaSubJob'

  /**
   * @param tree     已经 fetch 到的漫画 tree(通常由 PullMangaSubJob 拿到后传入)
   * @param baseDir  本地保存根目录(与漫画主体保持一致,不重复套层)
   */
  constructor(
    private tree: TreeResponseData,
    private baseDir: string
  ) {}

  async prepare(ctx: PullContext): Promise<number> {
    if (await ctx.isCanceled()) return 0

    if (!this.tree || !this.tree.files?.length) return 0
    if (this.tree.isSingleFile) {
      // 单文件漫画(如 xxx.zip),漫画目录里不会有独立元数据文件
      return 0
    }

    const metaTasks = treeToFileTasks(this.tree, this.baseDir, isMetaFile)
    if (!metaTasks.length) {
      console.log(`[${ctx.logTag}] ${this.name} 无元数据文件 baseDir=${path.basename(this.baseDir)}`)
      return 0
    }

    enqueueTasks(ctx, metaTasks)
    const bytes = metaTasks.reduce((a, t) => a + (t.size || 0), 0)
    console.log(
      `[${ctx.logTag}] ${this.name} 入池完成 baseDir=${path.basename(this.baseDir)} ` +
      `files=${metaTasks.length} bytes=${bytes}`
    )
    return metaTasks.length
  }
}