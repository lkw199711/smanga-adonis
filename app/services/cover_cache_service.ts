import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Semaphore } from 'async-mutex'
import sharp from 'sharp'
import { path_poster, posterBucket } from '#utils/index'

const cacheKinds = ['manga', 'chapter', 'meta'] as const
export type CoverKind = (typeof cacheKinds)[number]

const pending = new Map<string, Promise<void>>()
const encoders = new Semaphore(2)
const maxBytes = 512 * 1024 * 1024
const maxFiles = 20_000
let cleanup: Promise<void> | undefined
let nextCleanup = 0

export const coverCacheDirectory = () => path.join(path.dirname(path_poster()), 'poster-cache')

export function coverCacheFile(kind: CoverKind, id: number, version: string) {
  const key = createHash('sha256').update(version).digest('hex').slice(0, 24)
  const extension = kind === 'meta' ? 'original' : 'webp'
  return path.join(
    coverCacheDirectory(),
    kind,
    posterBucket(id),
    `${id}-${key}.${extension}`
  )
}

async function openFile(file: string) {
  const handle = await fs.open(file, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size === 0)
      throw Object.assign(new Error('图片不可读'), { code: 'ENOENT' })
    return { handle, stat }
  } catch (error) {
    await handle.close()
    throw error
  }
}

export async function openCoverFile(file: string) {
  const { handle } = await openFile(file)
  return handle.createReadStream()
}

export async function openCachedCover(file: string) {
  try {
    const { handle, stat } = await openFile(file)
    if (Date.now() - stat.mtimeMs > 15 * 60_000) {
      const now = new Date()
      await handle.utimes(now, now).catch(() => {})
    }
    return handle.createReadStream()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return null
  }
}

export function cacheCover(file: string, getSource: () => Promise<string>) {
  return cacheImage(file, getSource, async (source, target) => {
    await sharp(source, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(600, 900, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(target)
  })
}

export function cacheMetaImage(file: string, getSource: () => Promise<string>) {
  // Keep full-width banners and animated or transparent artwork in their original format.
  return cacheImage(file, getSource, (source, target) => fs.copyFile(source, target))
}

async function cacheImage(
  file: string,
  getSource: () => Promise<string>,
  writeImage: (source: string, target: string) => Promise<void>
) {
  let job = pending.get(file)
  if (!job) {
    job = encoders
      .runExclusive(async () => {
        const existing = await fs.stat(file).catch((error) => {
          if (error.code === 'ENOENT') return null
          throw error
        })
        if (existing?.isFile() && existing.size > 0) return

        const source = await getSource()
        await fs.mkdir(path.dirname(file), { recursive: true })
        const temporary = `${file}.${randomUUID()}.tmp`
        try {
          await writeImage(source, temporary)
          await fs.rename(temporary, file)
        } finally {
          await fs.unlink(temporary).catch(() => {})
        }
      })
      .finally(() => pending.delete(file))
    pending.set(file, job)
  }
  await job
  const stream = await openCoverFile(file)
  scheduleCleanup()
  return stream
}

function scheduleCleanup() {
  if (cleanup || Date.now() < nextCleanup) return
  nextCleanup = Date.now() + 5 * 60_000
  cleanup = trimCache()
    .catch((error) => console.warn('封面缓存清理失败', error))
    .finally(() => {
      cleanup = undefined
    })
}

async function trimCache() {
  const files: Array<{ file: string; size: number; modified: number }> = []
  let bytes = 0
  const entries = async (dir: string) =>
    fs.readdir(dir, { withFileTypes: true }).catch((error) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
  for (const kind of cacheKinds) {
    const directory = path.join(coverCacheDirectory(), kind)
    for (const bucket of await entries(directory)) {
      if (!bucket.isDirectory() || !/^\d+$/.test(bucket.name)) continue
      const bucketPath = path.join(directory, bucket.name)
      for (const entry of await entries(bucketPath)) {
        if (!entry.isFile() || !/^\d+-[a-f0-9]{24}\.(webp|original)$/.test(entry.name)) continue
        const file = path.join(bucketPath, entry.name)
        const stat = await fs.stat(file).catch(() => null)
        if (!stat) continue
        bytes += stat.size
        files.push({ file, size: stat.size, modified: stat.mtimeMs })
      }
    }
  }
  let count = files.length
  if (bytes <= maxBytes && count <= maxFiles) return
  files.sort((a, b) => a.modified - b.modified)
  for (const item of files) {
    if (bytes <= maxBytes && count <= maxFiles) break
    if (pending.has(item.file)) continue
    const removed = await fs.unlink(item.file).then(
      () => true,
      () => false
    )
    if (!removed) continue
    bytes -= item.size
    count--
  }
}
