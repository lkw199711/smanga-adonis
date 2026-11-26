import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import prisma from '#start/prisma'
import {
  LibraryPathContext,
  LibraryPathError,
  type PathWithStorageRoot,
} from './library_path_service.js'
import { checkStorageRootPath } from './storage_root_service.js'

type ScanPath = PathWithStorageRoot & { pathContent: string; deleteFlag: number }
type AvailabilityCode =
  | 'AVAILABLE'
  | 'STORAGE_ROOT_MISSING'
  | 'STORAGE_ROOT_DISABLED'
  | 'STORAGE_ROOT_UNAVAILABLE'
  | 'SCAN_PATH_UNAVAILABLE'
  | 'SOURCE_MISSING'
  | 'SOURCE_UNAVAILABLE'
  | 'CHECK_TIMEOUT'

export type ResourceAvailability = {
  status: 'available' | 'unavailable' | 'unknown'
  code: AvailabilityCode
  message: string
}

const ready: ResourceAvailability = { status: 'available', code: 'AVAILABLE', message: '' }
const timedOut: ResourceAvailability = {
  status: 'unknown',
  code: 'CHECK_TIMEOUT',
  message: '存储检测超时，请稍后重试。',
}
const unavailable = (code: AvailabilityCode, message: string): ResourceAvailability => ({
  status: 'unavailable',
  code,
  message,
})

const cacheTimeMs = 15_000
const checkTimeoutMs = 1_500
const cache = new Map<string, { time: number; result: ResourceAvailability }>()
const pending = new Map<string, Promise<ResourceAvailability>>()

async function withTimeout<T>(check: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      check,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), checkTimeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function remembered(
  key: string,
  check: () => Promise<ResourceAvailability>,
  refresh: boolean
): Promise<ResourceAvailability> {
  const active = pending.get(key)
  if (active) return active
  const previous = cache.get(key)
  if (!refresh && previous && Date.now() - previous.time < cacheTimeMs) {
    return Promise.resolve(previous.result)
  }
  const current = withTimeout(check(), timedOut)
    .then((result) => {
      if (cache.size >= 512) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      cache.set(key, { time: Date.now(), result })
      return result
    })
    .finally(() => pending.delete(key))
  pending.set(key, current)
  return current
}

function configProblem(record: ScanPath | null): ResourceAvailability | null {
  if (!record || record.deleteFlag === 1) {
    return unavailable('SCAN_PATH_UNAVAILABLE', '此资源对应的扫描路径已移除。')
  }
  if (!record.storageRootId) return null
  if (!record.storageRoot || record.storageRoot.deleteFlag === 1) {
    return unavailable('STORAGE_ROOT_MISSING', '此路径绑定的存储根不存在。')
  }
  if (record.storageRoot.enabled !== 1) {
    const name = record.storageRoot.rootName
    return unavailable(
      'STORAGE_ROOT_DISABLED',
      name ? `存储根「${name}」已停用。` : '存储根已停用。'
    )
  }
  return null
}

async function checkScanPath(record: ScanPath, refresh = false): Promise<ResourceAvailability> {
  const problem = configProblem(record)
  if (problem) return problem
  if (!record.storageRoot) return ready
  const root = record.storageRoot
  const label = root.rootName ? `存储根「${root.rootName}」` : '存储根'
  const result = await remembered(
    JSON.stringify(['root', root.rootPath]),
    async () => {
      const check = await checkStorageRootPath(root.rootPath)
      if (check.available) return ready
      const reason =
        check.code === 'PERMISSION_DENIED' ? '没有读取权限' : '目录不可访问，请检查挂载状态'
      return unavailable('STORAGE_ROOT_UNAVAILABLE', reason)
    },
    refresh
  )
  if (result.status === 'unavailable') return { ...result, message: `${label}${result.message}。` }
  if (result.status !== 'available') return result

  let directory: string
  try {
    directory = new LibraryPathContext(record).resolve(record.pathContent)
  } catch (error) {
    if (!(error instanceof LibraryPathError)) throw error
    return unavailable('SCAN_PATH_UNAVAILABLE', `${label}内的扫描目录配置无效。`)
  }
  if (record.pathContent === '.') return ready
  const scanResult = await remembered(
    JSON.stringify(['scan', directory]),
    async () => {
      const check = await checkStorageRootPath(directory)
      return check.available
        ? ready
        : unavailable('SCAN_PATH_UNAVAILABLE', '内的扫描目录不可访问。')
    },
    refresh
  )
  return scanResult.status === 'unavailable'
    ? { ...scanResult, message: label + scanResult.message }
    : scanResult
}

export function summarizePathAvailability(paths: Array<ResourceAvailability | null>) {
  const unavailablePaths = paths.filter((item) => item?.status === 'unavailable').length
  const unknownPaths = paths.filter((item) => item?.status === 'unknown').length
  const monitoredPaths = paths.filter(Boolean).length
  const status =
    unavailablePaths > 0
      ? unavailablePaths === paths.length
        ? 'unavailable'
        : 'partial'
      : unknownPaths > 0
        ? 'unknown'
        : monitoredPaths > 0
          ? 'available'
          : 'unmonitored'
  return { status, unavailablePaths, unknownPaths }
}

export async function mediaAvailability(mediaIds: number[]) {
  const result = new Map<number, ReturnType<typeof summarizePathAvailability>>()
  if (!mediaIds.length) return result
  const paths = await prisma.path.findMany({
    where: { mediaId: { in: mediaIds }, deleteFlag: 0 },
    include: { storageRoot: true },
  })
  const statuses = await Promise.all(
    paths.map((record) => (record.storageRootId ? checkScanPath(record) : null))
  )
  const byMedia = new Map<number, Array<ResourceAvailability | null>>()
  paths.forEach((record, index) => {
    const entries = byMedia.get(record.mediaId) ?? []
    entries.push(statuses[index])
    byMedia.set(record.mediaId, entries)
  })
  for (const mediaId of mediaIds)
    result.set(mediaId, summarizePathAvailability(byMedia.get(mediaId) ?? []))
  return result
}

export async function resolveReadableSource(
  record: ScanPath | null,
  storedPath: string,
  resource: '漫画' | '章节'
): Promise<{ path: string | null; availability: ResourceAvailability }> {
  const problem = configProblem(record)
  if (problem) return { path: null, availability: problem }
  let file: string
  try {
    file = new LibraryPathContext(record).resolve(storedPath)
  } catch (error) {
    if (!(error instanceof LibraryPathError)) throw error
    return {
      path: null,
      availability: unavailable('SOURCE_UNAVAILABLE', `${resource}源路径无效。`),
    }
  }

  const check = await withTimeout(
    fs.access(file, constants.R_OK).then(
      () => ({ state: 'readable' }),
      (error: NodeJS.ErrnoException) => ({
        state: error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'missing' : 'unreadable',
      })
    ),
    { state: 'timeout' }
  )
  if (check.state === 'readable') return { path: file, availability: ready }
  if (check.state === 'timeout') return { path: null, availability: timedOut }

  if (record?.storageRootId) {
    const scan = await checkScanPath(record, true)
    if (scan.status !== 'available') return { path: null, availability: scan }
  }
  const missing = check.state === 'missing'
  return {
    path: null,
    availability: unavailable(
      missing ? 'SOURCE_MISSING' : 'SOURCE_UNAVAILABLE',
      missing
        ? `${resource}源文件不存在，请检查文件是否移动或挂载是否完整。`
        : `${resource}源文件无法读取，请检查权限或挂载状态。`
    ),
  }
}
