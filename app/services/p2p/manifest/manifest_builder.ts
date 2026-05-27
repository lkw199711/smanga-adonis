/**
 * 共享清单(Share Manifest)构建器
 *
 * 支持两种来源:
 * 1. 本地 media/manga/chapter 主库
 * 2. p2p_local_share 上记录的物理路径(sharePath)
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import prisma from '#start/prisma'
import p2pIdentityService from '#services/p2p/p2p_identity_service'
import { resolvePathShareMangas, type ShareLike } from '../path_share_resolver.js'
import {
  PAYLOAD_MAX_BYTES,
  type ManifestPayload,
  type ManifestManga,
  type ManifestChapter,
  type ManifestTreeNode,
  type BuildManifestResult,
} from './manifest_types.js'

const IMAGE_AVG_SIZE = 200 * 1024
const DEFAULT_PIC_NUM = 25
const TREE_MAX_FILES = 2000
const TREE_MAX_DEPTH = 6

function safeFileSize(input: string): number {
  try {
    const st = fs.statSync(input)
    return st.isFile() ? st.size : 0
  } catch {
    return 0
  }
}

function estimateChapterSize(chapter: {
  chapterType: string
  chapterPath: string
  picNum: number | null
}): number {
  if (chapter.chapterType === 'image') {
    const count = chapter.picNum && chapter.picNum > 0 ? chapter.picNum : DEFAULT_PIC_NUM
    return count * IMAGE_AVG_SIZE
  }
  return safeFileSize(chapter.chapterPath)
}

function scanChapterTree(chapterPath: string): ManifestTreeNode[] {
  if (!chapterPath) return []
  let rootStat: fs.Stats
  try {
    rootStat = fs.statSync(chapterPath)
  } catch {
    return []
  }
  if (rootStat.isFile()) {
    return [{ t: 'f', n: path.basename(chapterPath), s: rootStat.size }]
  }
  if (!rootStat.isDirectory()) return []

  let fileCount = 0
  const walk = (dir: string, depth: number): ManifestTreeNode[] => {
    if (depth > TREE_MAX_DEPTH || fileCount >= TREE_MAX_FILES) return []
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
    const result: ManifestTreeNode[] = []
    for (const ent of entries) {
      if (fileCount >= TREE_MAX_FILES) break
      if (ent.name === 'Thumbs.db' || ent.name === '.DS_Store' || ent.name === 'desktop.ini') continue
      const abs = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        const children = walk(abs, depth + 1)
        result.push({ t: 'd', n: ent.name, s: 0, c: children })
      } else if (ent.isFile()) {
        const size = safeFileSize(abs)
        result.push({ t: 'f', n: ent.name, s: size })
        fileCount += 1
      }
    }
    return result
  }
  return walk(chapterPath, 0)
}

function serialize(payload: ManifestPayload): { json: string; size: number } {
  const json = JSON.stringify(payload)
  const size = Buffer.byteLength(json, 'utf8')
  return { json, size }
}

function sha1(input: string): string {
  return crypto.createHash('sha1').update(input, 'utf8').digest('hex')
}

async function buildDbBackedManifestMangas(
  mangaList: Array<{
    mangaId: number
    mangaName: string
    mangaCover: string | null
    describe: string | null
    author: string | null
    chapterCount: number
  }>
): Promise<ManifestManga[]> {
  const mangaIds = mangaList.map((m) => m.mangaId)
  const chapters = mangaIds.length
    ? await prisma.chapter.findMany({
        where: { mangaId: { in: mangaIds }, deleteFlag: 0 },
        orderBy: [{ mangaId: 'asc' }, { chapterNumber: 'asc' }],
        select: {
          chapterId: true,
          mangaId: true,
          chapterName: true,
          chapterType: true,
          chapterPath: true,
          picNum: true,
        },
      })
    : []

  const chaptersByManga = new Map<number, typeof chapters>()
  for (const chapter of chapters) {
    const arr = chaptersByManga.get(chapter.mangaId) || []
    arr.push(chapter)
    chaptersByManga.set(chapter.mangaId, arr)
  }

  return mangaList.map((manga) => {
    const cs = chaptersByManga.get(manga.mangaId) || []
    const manifestChapters: ManifestChapter[] = cs.map((chapter: (typeof chapters)[number]) => ({
      remoteChapterId: chapter.chapterId,
      chapterName: chapter.chapterName,
      chapterType: chapter.chapterType,
      size: estimateChapterSize(chapter),
      imageCount: chapter.picNum || 0,
      tree: scanChapterTree(chapter.chapterPath),
    }))

    return {
      remoteMangaId: manga.mangaId,
      mangaName: manga.mangaName,
      mangaCover: manga.mangaCover,
      describe: manga.describe,
      author: manga.author,
      chapterCount: manifestChapters.length,
      totalSize: manifestChapters.reduce((sum, chapter) => sum + chapter.size, 0),
      chapters: manifestChapters,
    }
  })
}

function finalizeManifest(args: {
  identity: { nodeId: string; nodeName: string | null }
  nodeVersion?: string
  shareType: string
  remoteMediaId: number | null
  remoteMangaId: number | null
  shareName: string
  shareCover: string | null
  shareCoverSize: number | null
  shareDescribe: string | null
  mangas: ManifestManga[]
}): BuildManifestResult {
  const totalChapterCount = args.mangas.reduce((acc, manga) => acc + manga.chapterCount, 0)
  const totalSize = args.mangas.reduce((acc, manga) => acc + manga.totalSize, 0)

  const payloadBase: ManifestPayload = {
    schema: 'share-manifest/v1',
    generatedAt: Date.now(),
    node: {
      nodeId: args.identity.nodeId,
      nodeName: args.identity.nodeName || undefined,
      version: args.nodeVersion,
    },
    share: {
      shareType: args.shareType === 'manga' ? 'manga' : 'media',
      remoteMediaId: args.remoteMediaId,
      remoteMangaId: args.remoteMangaId,
      shareName: args.shareName,
      coverUrl: args.shareCover,
      coverSize: args.shareCoverSize,
      describe: args.shareDescribe,
    },
    stats: {
      mangaCount: args.mangas.length,
      chapterCount: totalChapterCount,
      totalSize,
    },
    mangas: args.mangas,
  }

  let { json, size } = serialize(payloadBase)
  let payloadTruncated = false

  if (size > PAYLOAD_MAX_BYTES) {
    payloadTruncated = true
    for (const manga of payloadBase.mangas) {
      for (const chapter of manga.chapters) {
        if (chapter.tree) delete chapter.tree
      }
    }
    const retry = serialize(payloadBase)
    json = retry.json
    size = retry.size
  }

  return {
    payload: payloadBase,
    payloadSize: size,
    payloadTruncated,
    contentHash: sha1(json),
    payloadJson: json,
  }
}

export async function buildShareManifest(share: {
  p2pLocalShareId: number
  shareType: string
  mediaId: number | null
  mangaId: number | null
  remoteMediaId?: number | null
  remoteMangaId?: number | null
  sharePath?: string | null
  shareName: string
}): Promise<BuildManifestResult | null> {
  const identity = p2pIdentityService.getIdentity()
  if (!identity) return null

  const nodeVersion: string | undefined = undefined
  const remoteMediaId = share.remoteMediaId ?? share.mediaId ?? null
  const remoteMangaId = share.remoteMangaId ?? share.mangaId ?? null

  let shareCover: string | null = null
  let shareCoverSize: number | null = null
  let shareDescribe: string | null = null

  if (share.shareType === 'media' && share.mediaId) {
    const media = await prisma.media.findUnique({ where: { mediaId: share.mediaId } })
    if (!media) return null
    shareCover = media.mediaCover || null
    shareCoverSize = shareCover ? safeFileSize(shareCover) || null : null

    const mangaList = await prisma.manga.findMany({
      where: { mediaId: share.mediaId, deleteFlag: 0 },
      orderBy: { mangaName: 'asc' },
      select: {
        mangaId: true,
        mangaName: true,
        mangaCover: true,
        describe: true,
        author: true,
        chapterCount: true,
      },
    })

    const mangas = await buildDbBackedManifestMangas(mangaList)
    return finalizeManifest({
      identity,
      nodeVersion,
      shareType: share.shareType,
      remoteMediaId,
      remoteMangaId,
      shareName: share.shareName,
      shareCover,
      shareCoverSize,
      shareDescribe,
      mangas,
    })
  }

  if (share.shareType === 'manga' && share.mangaId) {
    const manga = await prisma.manga.findUnique({
      where: { mangaId: share.mangaId },
      select: {
        mangaId: true,
        mangaName: true,
        mangaCover: true,
        describe: true,
        author: true,
        chapterCount: true,
      },
    })
    if (!manga) return null
    shareCover = manga.mangaCover || null
    shareCoverSize = shareCover ? safeFileSize(shareCover) || null : null
    shareDescribe = manga.describe || null

    const mangas = await buildDbBackedManifestMangas([manga])
    return finalizeManifest({
      identity,
      nodeVersion,
      shareType: share.shareType,
      remoteMediaId,
      remoteMangaId,
      shareName: share.shareName,
      shareCover,
      shareCoverSize,
      shareDescribe,
      mangas,
    })
  }

  if (!share.sharePath) return null

  const pathMangas = await resolvePathShareMangas(share as ShareLike)
  if (!pathMangas.length) return null

  const mangas: ManifestManga[] = pathMangas.map((manga) => ({
    remoteMangaId: manga.remoteMangaId,
    mangaName: manga.mangaName,
    mangaCover: manga.mangaCover,
    describe: manga.describe,
    author: manga.author,
    chapterCount: manga.chapterCount,
    totalSize: manga.totalSize,
    chapters: manga.chapters.map((chapter) => ({
      remoteChapterId: chapter.remoteChapterId,
      chapterName: chapter.chapterName,
      chapterType: chapter.chapterType,
      size: chapter.size,
      imageCount: chapter.imageCount,
      tree: scanChapterTree(chapter.chapterPath),
    })),
  }))

  return finalizeManifest({
    identity,
    nodeVersion,
    shareType: share.shareType,
    remoteMediaId,
    remoteMangaId: share.shareType === 'manga' ? (remoteMangaId || mangas[0]?.remoteMangaId || null) : remoteMangaId,
    shareName: share.shareName,
    shareCover,
    shareCoverSize,
    shareDescribe,
    mangas,
  })
}
