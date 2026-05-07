/**
 * 对端 tree/mangas 接口调用封装
 *
 * 与下载文件不同,tree/mangas 是"目录列表"类一次性请求,
 * 这里走元请求级 failover:在所有 seed 之间逐个尝试,任一成功即返回。
 *
 * 拆出此文件的目的:让所有子任务复用同一套 axios 调用 + 错误格式化逻辑,
 * 避免在每个子任务里重复实现 withSeedFailover。
 */

import axios from 'axios'
import type { Seed } from '../p2p_download_pool.js'
import type { PullHeaders, TreeResponseData } from './pull_context.js'

/**
 * 从 axios 错误中提取详细信息(对端拒连/超时/HTTP 状态等)
 */
export function format_axios_error(err: any, context: string): string {
  const url = err?.config?.url || '(unknown url)'
  const method = (err?.config?.method || 'get').toUpperCase()
  const status = err?.response?.status
  const remoteMsg = err?.response?.data?.message
  const code = err?.code

  if (!status) {
    if (code === 'ECONNREFUSED') return `${context}: 对端拒绝连接 (${method} ${url})`
    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') return `${context}: 请求超时 (${method} ${url})`
    if (code === 'ENOTFOUND') return `${context}: 域名解析失败 (${method} ${url})`
    return `${context}: 网络错误 ${code || ''} (${method} ${url}) - ${err?.message}`
  }

  let hint = ''
  if (status === 401) hint = ' (握手信息缺失或时间戳过期)'
  else if (status === 403) hint = ' (对端 Tracker 鉴权拒绝)'
  else if (status === 404) hint = ' (资源不存在)'
  else if (status === 503) hint = ' (对端 P2P 服务未启用)'

  return `${context}: HTTP ${status}${hint} (${method} ${url}) - ${remoteMsg || err?.message}`
}

/**
 * 元请求级 failover:在所有 seed 之间逐个尝试,任一成功即返回
 *
 * 注意:下载文件的 failover 由 P2PDownloadPool 内部处理(基于 seed 失败计数 + 冷静期),
 * 这里只服务于"列清单"这种一次性调用。
 */
export async function withSeedFailover<T>(
  seeds: Seed[],
  context: string,
  logTag: string,
  fn: (seed: Seed) => Promise<T>
): Promise<T> {
  let lastErr: any = null
  for (const seed of seeds) {
    try {
      return await fn(seed)
    } catch (e: any) {
      const msg = format_axios_error(e, `${context} @ ${seed.nodeName || seed.nodeId}`)
      console.warn(`[${logTag}] ${msg},尝试下一个 seed`)
      lastErr = new Error(msg)
    }
  }
  throw lastErr || new Error(`${context}: 所有 seed 均失败`)
}

/** 调对端 /p2p/serve/manga/:id/tree */
export async function fetchMangaTree(
  seeds: Seed[],
  headers: PullHeaders,
  logTag: string,
  mangaId: number
): Promise<TreeResponseData> {
  return withSeedFailover(seeds, `获取漫画目录树 (mangaId=${mangaId})`, logTag, async (seed) => {
    const url = `${seed.baseUrl}/p2p/serve/manga/${mangaId}/tree`
    const res = await axios.get(url, { headers, timeout: 60 * 1000 })
    return res.data?.data as TreeResponseData
  })
}

/** 调对端 /p2p/serve/chapter/:id/tree */
export async function fetchChapterTree(
  seeds: Seed[],
  headers: PullHeaders,
  logTag: string,
  chapterId: number
): Promise<TreeResponseData> {
  return withSeedFailover(seeds, `获取章节目录树 (chapterId=${chapterId})`, logTag, async (seed) => {
    const url = `${seed.baseUrl}/p2p/serve/chapter/${chapterId}/tree`
    const res = await axios.get(url, { headers, timeout: 60 * 1000 })
    return res.data?.data as TreeResponseData
  })
}

/** 调对端 /p2p/serve/media/:id/mangas */
export async function fetchMediaMangas(
  seeds: Seed[],
  headers: PullHeaders,
  logTag: string,
  mediaId: number
): Promise<any[]> {
  return withSeedFailover(seeds, `获取媒体库漫画列表 (mediaId=${mediaId})`, logTag, async (seed) => {
    const url = `${seed.baseUrl}/p2p/serve/media/${mediaId}/mangas`
    const res = await axios.get(url, { headers, timeout: 30 * 1000 })
    return (res.data?.list ?? []) as any[]
  })
}