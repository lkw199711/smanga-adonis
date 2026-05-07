/**
 * P2P 拉取子任务共享类型与工具(队列化版本)
 *
 * C 方案设计:每个子任务都是独立的 Bull Job,自己起小下载池跟 seeds 并行跑。
 *  - 子任务之间不共享 P2PDownloadPool(只在单个子任务内部)
 *  - 子任务之间通过 p2p_transfer(父) + 内存计数器(pull_child_tracker) 关联
 *  - 真正的多节点并行发生在:
 *      1) p2p 队列 concurrency=N(默认等于 node.maxConcurrentPulls),
 *         同时可有 N 个子任务在跑
 *      2) 每个子任务内部的 P2PDownloadPool 再按 seeds 数量并行
 *    二者相乘 = 总带宽上限
 */

import path from 'path'
import type { Seed } from '../p2p_download_pool.js'

export type PullHeaders = Record<string, string>

/** tree 接口响应结构(与 p2p_serve_controller 保持一致) */
export type TreeResponseData = {
  isSingleFile: boolean
  rootDir: string
  fileCount: number
  totalBytes: number
  files: Array<{ absPath: string; relPath: string; size: number; mtime: number }>
  // 漫画级独有
  mangaId?: number
  mangaName?: string
  mangaPath?: string
  // 章节级独有
  chapterId?: number
  chapterName?: string
  chapterPath?: string
}

/** tree 中单个文件条目 */
export type TreeFileEntry = TreeResponseData['files'][number]

/**
 * 根据 transferType + Tracker 发现 seeds(供子任务独立调用)
 */
export type DiscoverSeedsArgs = {
  groupNo: string
  shareType: 'media' | 'manga' | 'chapter'
  remoteMediaId?: number
  remoteMangaId?: number
}

/** 将任意字符串做路径安全化(windows 非法字符替换) */
export function safeName(name: string): string {
  return (
    String(name)
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/^\.+/, '_')
      .trim()
      .slice(0, 200) || 'unnamed'
  )
}

/** 从 tree 的 files 转 FileTask(本地路径拼接 + 过滤) */
export function treeFilesToTasks(
  files: TreeFileEntry[],
  baseLocalDir: string,
  filter?: (relPath: string) => boolean
): Array<{ remoteAbsPath: string; localPath: string; size: number; attempts: number }> {
  const out: Array<{ remoteAbsPath: string; localPath: string; size: number; attempts: number }> = []
  for (const f of files || []) {
    if (filter && !filter(f.relPath)) continue
    out.push({
      remoteAbsPath: f.absPath,
      localPath: path.join(baseLocalDir, f.relPath.split('/').join(path.sep)),
      size: f.size || 0,
      attempts: 0,
    })
  }
  return out
}

/** 保留 Seed 类型的再导出,便于子任务直接用 */
export type { Seed }