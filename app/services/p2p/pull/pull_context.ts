/**
 * 子任务共享上下文
 *
 * 方案 B(不持久化子任务):子任务不在 p2p_transfer 表中独立成行,
 * 而是作为父任务 P2PPullJob 运行时的内存阶段。所有子任务共享本上下文:
 *   - seeds / headers:Tracker 发现的候选节点与鉴权头
 *   - pool:所有阶段的 FileTask 都入同一个下载池,保持多节点并行
 *   - receivedPath:本地接收根目录
 *   - isCanceled:取消检查(读 p2p_transfer.status)
 *
 * 父任务负责在所有子任务展开完成后调用 pool.run(seeds) 统一下载。
 */

import path from 'path'
import type { FileTask, Seed } from '../p2p_download_pool.js'
import type { P2PDownloadPool } from '../p2p_download_pool.js'

export type PullHeaders = Record<string, string>

export type PullContext = {
  /** 父任务的 transfer 主键,仅用于日志/取消检查 */
  transferId: number
  /** Tracker 下发的候选节点列表 */
  seeds: Seed[]
  /** 鉴权头 X-Node-Id / X-Group-No / X-Timestamp */
  headers: PullHeaders
  /** 下载池:所有子任务向其入队,父任务统一 run */
  pool: P2PDownloadPool
  /** 本地接收根目录(已 path.resolve) */
  receivedPath: string
  /** 取消检查;子任务可在展开 tree 的长流程中适时检查 */
  isCanceled: () => Promise<boolean>
  /** 日志前缀(含 transferId) */
  logTag: string
  /** 子任务入池时累计的预计字节数(供父任务统计 totalBytes,避免反射访问 pool 内部) */
  enqueuedBytes: number
}

/**
 * 封装入池 + 字节累计的便捷方法
 * 子任务统一通过此函数入池,确保 ctx.enqueuedBytes 与 pool.enqueue 同步。
 */
export function enqueueTasks(ctx: PullContext, tasks: FileTask[]): void {
  if (!tasks.length) return
  ctx.pool.enqueue(tasks)
  for (const t of tasks) {
    ctx.enqueuedBytes += t.size || 0
  }
}

/**
 * 子任务统一接口
 *
 * 子任务的职责仅限于:
 *   1. 调对端 tree/mangas 接口获取文件清单
 *   2. 把清单转换为 FileTask 并 ctx.pool.enqueue
 *   3. (可选)展开更深一层的子任务并运行
 *
 * 注意:子任务本身不负责"启动下载",下载由父任务在所有子任务 prepare 完成后
 * 统一通过 ctx.pool.run(seeds) 触发;子任务只管"往池子里加任务"。
 *
 * 之所以提供 prepare 而不是 run:保证所有 tree 请求先批量完成,再一次性启动
 * 多节点并行下载,避免"tree 串行 + 下载串行"互相阻塞。
 */
export interface IPullSubJob {
  /** 子任务名字,用于日志 */
  readonly name: string
  /**
   * 展开阶段:往 ctx.pool 入队 FileTask
   * @returns 该子任务入池的文件数量(用于日志汇总,非强制)
   */
  prepare(ctx: PullContext): Promise<number>
}

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

/** 把 tree 响应拍平成 FileTask(内部工具,子任务共用) */
export function treeToFileTasks(
  tree: TreeResponseData,
  baseLocalDir: string,
  filter?: (relPath: string) => boolean
): FileTask[] {
  if (!tree?.files?.length) return []
  const out: FileTask[] = []
  for (const f of tree.files) {
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