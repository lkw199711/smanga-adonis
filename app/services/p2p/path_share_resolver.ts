import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import prisma from '#start/prisma'

export type ShareLike = {
  p2pLocalShareId: number
  p2pGroupId: number
  shareType: string
  mediaId: number | null
  mangaId: number | null
  remoteMediaId?: number | null
  remoteMangaId?: number | null
  sharePath?: string | null
  shareName: string
  enable?: number
}

export type ResolvedChapter = {
  remoteChapterId: number
  chapterName: string
  chapterType: string
  chapterPath: string
  imageCount: number
  size: number
}

export type ResolvedManga = {
  remoteMangaId: number
  mangaName: string
  mangaPath: string
  mangaCover: string | null
  describe: string | null
  author: string | null
  chapterCount: number
  totalSize: number
  chapters: ResolvedChapter[]
}

const IMAGE_AVG_SIZE = 200 * 1024
const DEFAULT_PIC_NUM = 25
const SUPPORTED_EXTS = ['.zip', '.cbz', '.cbr', '.epub', '.rar', '.7z', '.pdf']

function normalizeFsPath(input: string) {
  return path.normalize(input).replace(/[\\\/]+$/, '')
}

function stableRemoteId(seed: string): number {
  const hex = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 8)
  const raw = parseInt(hex, 16) & 0x7fffffff
  return raw > 0 ? raw : 1
}

function fileExists(input: string | null | undefined): input is string {
  return !!input && fs.existsSync(input)
}

function safeStat(input: string) {
  try {
    return fs.statSync(input)
  } catch {
    return null
  }
}

function safeFileSize(input: string) {
  const st = safeStat(input)
  return st?.isFile() ? st.size : 0
}

function detectChapterType(input: string) {
  const lower = input.toLowerCase()
  if (lower.endsWith('.7z')) return '7z'
  if (lower.endsWith('.rar')) return 'rar'
  if (lower.endsWith('.pdf')) return 'pdf'
  if (SUPPORTED_EXTS.some((ext) => lower.endsWith(ext))) return 'zip'
  return 'img'
}

function listChapterCandidates(mangaPath: string) {
  const st = safeStat(mangaPath)
  if (!st || !st.isDirectory()) return []

  const names = fs
    .readdirSync(mangaPath)
    .filter((item) => item !== '.' && item !== '..' && !/^\./.test(item))

  const chapters: Array<{ chapterName: string; chapterPath: string; chapterType: string }> = []
  for (const item of names) {
    const itemPath = path.join(mangaPath, item)
    const itemStat = safeStat(itemPath)
    if (!itemStat) continue

    if (itemStat.isDirectory()) {
      chapters.push({
        chapterName: item,
        chapterPath: itemPath,
        chapterType: 'img',
      })
      continue
    }

    const ext = path.extname(itemPath).toLowerCase()
    if (!SUPPORTED_EXTS.includes(ext)) continue
    chapters.push({
      chapterName: path.basename(item, ext),
      chapterPath: itemPath,
      chapterType: detectChapterType(itemPath),
    })
  }

  return chapters
}

function estimateImageDirSize(dir: string) {
  let total = 0
  let count = 0
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop() as string
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name === 'Thumbs.db' || entry.name === '.DS_Store' || entry.name === 'desktop.ini') {
        continue
      }
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(abs)
      } else if (entry.isFile()) {
        const size = safeFileSize(abs)
        total += size
        count += 1
      }
    }
  }
  if (total <= 0 && count > 0) return { size: count * IMAGE_AVG_SIZE, imageCount: count }
  return { size: total, imageCount: count || DEFAULT_PIC_NUM }
}

async function resolveChaptersFromDb(mangaId: number) {
  const rows = await prisma.chapter.findMany({
    where: { mangaId, deleteFlag: 0 },
    orderBy: [{ chapterNumber: 'asc' }, { chapterName: 'asc' }],
    select: {
      chapterId: true,
      chapterName: true,
      chapterType: true,
      chapterPath: true,
      picNum: true,
    },
  })

  return rows.map((row: (typeof rows)[number]) => ({
    remoteChapterId: row.chapterId,
    chapterName: row.chapterName,
    chapterType: row.chapterType,
    chapterPath: row.chapterPath,
    imageCount: row.picNum || 0,
    size: row.chapterType === 'image'
      ? (row.picNum && row.picNum > 0 ? row.picNum : DEFAULT_PIC_NUM) * IMAGE_AVG_SIZE
      : safeFileSize(row.chapterPath),
  }))
}

async function resolveMangaByPath(opts: {
  mangaPath: string
  preferredRemoteMangaId?: number | null
  fallbackName?: string | null
}): Promise<ResolvedManga | null> {
  const mangaPath = normalizeFsPath(opts.mangaPath)
  if (!fileExists(mangaPath)) return null

  const local = await prisma.manga.findFirst({
    where: { mangaPath, deleteFlag: 0 },
    select: {
      mangaId: true,
      mangaName: true,
      mangaPath: true,
      mangaCover: true,
      describe: true,
      author: true,
      chapterCount: true,
    },
  })

  const remoteMangaId = opts.preferredRemoteMangaId || local?.mangaId || stableRemoteId(`manga:${mangaPath}`)

  if (local) {
    const chapters = await resolveChaptersFromDb(local.mangaId)
    const totalSize = chapters.reduce((sum: number, chapter: ResolvedChapter) => sum + chapter.size, 0)
    return {
      remoteMangaId,
      mangaName: local.mangaName,
      mangaPath: local.mangaPath,
      mangaCover: local.mangaCover,
      describe: local.describe,
      author: local.author,
      chapterCount: chapters.length,
      totalSize,
      chapters,
    }
  }

  const st = safeStat(mangaPath)
  if (!st) return null

  if (st.isFile()) {
    const chapterName = path.basename(mangaPath, path.extname(mangaPath))
    const chapterType = detectChapterType(mangaPath)
    const chapterSize = safeFileSize(mangaPath)
    return {
      remoteMangaId,
      mangaName: opts.fallbackName || chapterName,
      mangaPath,
      mangaCover: null,
      describe: null,
      author: null,
      chapterCount: 1,
      totalSize: chapterSize,
      chapters: [
        {
          remoteChapterId: stableRemoteId(`chapter:${mangaPath}`),
          chapterName,
          chapterType,
          chapterPath: mangaPath,
          imageCount: 0,
          size: chapterSize,
        },
      ],
    }
  }

  const chapterCandidates = listChapterCandidates(mangaPath)
  if (!chapterCandidates.length) {
    const estimated = estimateImageDirSize(mangaPath)
    return {
      remoteMangaId,
      mangaName: opts.fallbackName || path.basename(mangaPath),
      mangaPath,
      mangaCover: null,
      describe: null,
      author: null,
      chapterCount: 1,
      totalSize: estimated.size,
      chapters: [
        {
          remoteChapterId: stableRemoteId(`chapter:${mangaPath}`),
          chapterName: path.basename(mangaPath),
          chapterType: 'image',
          chapterPath: mangaPath,
          imageCount: estimated.imageCount,
          size: estimated.size,
        },
      ],
    }
  }

  const chapters = chapterCandidates.map((chapter) => {
    const stChapter = safeStat(chapter.chapterPath)
    const estimated = stChapter?.isDirectory()
      ? estimateImageDirSize(chapter.chapterPath)
      : { size: safeFileSize(chapter.chapterPath), imageCount: 0 }

    return {
      remoteChapterId: stableRemoteId(`chapter:${chapter.chapterPath}`),
      chapterName: chapter.chapterName,
      chapterType: chapter.chapterType,
      chapterPath: chapter.chapterPath,
      imageCount: estimated.imageCount,
      size: estimated.size,
    }
  })

  const totalSize = chapters.reduce((sum, chapter) => sum + chapter.size, 0)
  return {
    remoteMangaId,
    mangaName: opts.fallbackName || path.basename(mangaPath),
    mangaPath,
    mangaCover: null,
    describe: null,
    author: null,
    chapterCount: chapters.length,
    totalSize,
    chapters,
  }
}

export async function resolvePathShareMangas(share: ShareLike) {
  const rawPath = share.sharePath || null
  if (!fileExists(rawPath)) return []

  if (share.shareType === 'manga') {
    const manga = await resolveMangaByPath({
      mangaPath: rawPath,
      preferredRemoteMangaId: share.remoteMangaId ?? share.mangaId ?? null,
      fallbackName: share.shareName,
    })
    return manga ? [manga] : []
  }

  const rootPath = normalizeFsPath(rawPath)
  const st = safeStat(rootPath)
  if (!st) return []

  if (st.isFile()) {
    const manga = await resolveMangaByPath({
      mangaPath: rootPath,
      fallbackName: share.shareName,
    })
    return manga ? [manga] : []
  }

  const entries = fs
    .readdirSync(rootPath)
    .filter((item) => item !== '.' && item !== '..' && !/^\./.test(item) && !/smanga-info/.test(item))

  const mangas: ResolvedManga[] = []
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry)
    const entryStat = safeStat(entryPath)
    if (!entryStat) continue
    if (!entryStat.isDirectory()) {
      const ext = path.extname(entryPath).toLowerCase()
      if (!SUPPORTED_EXTS.includes(ext)) continue
    }

    const manga = await resolveMangaByPath({
      mangaPath: entryPath,
      fallbackName: entryStat.isDirectory() ? entry : path.basename(entry, path.extname(entry)),
    })
    if (manga) mangas.push(manga)
  }

  return mangas
}

export async function resolveShareByRemoteMediaId(groupNo: string, remoteMediaId: number) {
  const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
  if (!group) return null
  return prisma.p2p_local_share.findFirst({
    where: {
      p2pGroupId: group.p2pGroupId,
      shareType: 'media',
      enable: 1,
      OR: [
        { remoteMediaId },
        { mediaId: remoteMediaId },
      ],
    },
  }) as Promise<ShareLike | null>
}

export async function resolveShareByRemoteMangaId(groupNo: string, remoteMangaId: number) {
  const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
  if (!group) return null
  return prisma.p2p_local_share.findFirst({
    where: {
      p2pGroupId: group.p2pGroupId,
      shareType: 'manga',
      enable: 1,
      OR: [
        { remoteMangaId },
        { mangaId: remoteMangaId },
      ],
    },
  }) as Promise<ShareLike | null>
}

export async function resolvePathMangaByRemoteId(groupNo: string, remoteMangaId: number) {
  const directShare = await resolveShareByRemoteMangaId(groupNo, remoteMangaId)
  if (directShare) {
    const mangas = await resolvePathShareMangas(directShare)
    const matched = mangas.find((item) => item.remoteMangaId === remoteMangaId) || mangas[0]
    if (matched) return { share: directShare, manga: matched }
  }

  const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
  if (!group) return null
  const mediaShares = await prisma.p2p_local_share.findMany({
    where: {
      p2pGroupId: group.p2pGroupId,
      shareType: 'media',
      enable: 1,
      sharePath: { not: null },
    },
    orderBy: { p2pLocalShareId: 'asc' },
  }) as ShareLike[]

  for (const share of mediaShares) {
    const mangas = await resolvePathShareMangas(share)
    const matched = mangas.find((item) => item.remoteMangaId === remoteMangaId)
    if (matched) return { share, manga: matched }
  }

  return null
}

export async function resolvePathChapterByRemoteId(groupNo: string, remoteChapterId: number) {
  const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
  if (!group) return null

  const shares = await prisma.p2p_local_share.findMany({
    where: {
      p2pGroupId: group.p2pGroupId,
      enable: 1,
      sharePath: { not: null },
    },
    orderBy: { p2pLocalShareId: 'asc' },
  }) as ShareLike[]

  for (const share of shares) {
    const mangas = await resolvePathShareMangas(share)
    for (const manga of mangas) {
      const chapter = manga.chapters.find((item) => item.remoteChapterId === remoteChapterId)
      if (chapter) {
        return { share, manga, chapter }
      }
    }
  }

  return null
}
