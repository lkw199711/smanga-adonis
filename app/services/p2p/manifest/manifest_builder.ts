/**
 * 共享清单(Share Manifest)构建器(节点端)
 *
 * 职责:
 *  1. 根据 p2p_local_share 定位到 media 或 manga
 *  2. 从数据库查出 manga / chapter 元数据
 *  3. 估算 chapter size(散图 imageCount*常数, 压缩包走 fs.stat)
 *  4. 可选扫描每个 manga 的文件树,若总 payload 超过 100KB 则剥离文件树
 *  5. 计算 SHA1 hash,返回完整 BuildManifestResult
 *
 * 注意:本模块只负责构建 + 计算 hash,不负责持久化,也不负责 announce 网络调用
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import prisma from '#start/prisma'
import p2pIdentityService from '#services/p2p/p2p_identity_service'
import {
  PAYLOAD_MAX_BYTES,
  type ManifestPayload,
  type ManifestManga,
  type ManifestChapter,
  type ManifestTreeNode,
  type BuildManifestResult,
} from './manifest_types.js'

/** 单张散图的估算平均大小(字节) */
const IMAGE_AVG_SIZE = 200 * 1024
/** 当 chapter.picNum 缺失时的兜底图片数 */
const DEFAULT_PIC_NUM = 25
/** 单个文件树扫描的最大文件数(防爆) */
const TREE_MAX_FILES = 2000
/** 目录递归最大深度 */
const TREE_MAX_DEPTH = 6

/** 用 fs.stat 获取文件大小,失败返回 0 */
function safeFileSize(p: string): number {
  try {
    const st = fs.statSync(p)
    return st.isFile() ? st.size : 0
  } catch {
    return 0
  }
}

/**
 * 估算 chapter 大小:
 *  - chapterType='image' (散图): picNum * IMAGE_AVG_SIZE
 *  - 其他(压缩包/pdf/epub): fs.stat(chapterPath).size
 */
function estimateChapterSize(chapter: {
  chapterType: string
  chapterPath: string
  picNum: number | null
}): number {
  if (chapter.chapterType === 'image') {
    const count = chapter.picNum && chapter.picNum > 0 ? chapter.picNum : DEFAULT_PIC_NUM
    return count * IMAGE_AVG_SIZE
  }
  // 压缩包/pdf/epub 等:尝试读文件实际大小
  return safeFileSize(chapter.chapterPath)
}

/**
 * 递归扫描 chapter 目录生成文件树节点(精简格式)
 *  - 字段名使用单字母压缩体积(t/n/s/c)
 *  - 若 chapterPath 是单个文件,返回 [{t:'f', n:basename, s:size}]
 *  - 若是目录,递归下去
 *  - 超过 TREE_MAX_FILES 时提前结束(保证不爆内存)
 */
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
        let size = 0
        try {
          size = fs.statSync(abs).size
        } catch {
          size = 0
        }
        result.push({ t: 'f', n: ent.name, s: size })
        fileCount++
      }
    }
    return result
  }
  return walk(chapterPath, 0)
}

/** 序列化 payload 并返回字节长度 */
function serialize(payload: ManifestPayload): { json: string; size: number } {
  const json = JSON.stringify(payload)
  // UTF-8 字节数(中文会变 3 字节)
  const size = Buffer.byteLength(json, 'utf8')
  return { json, size }
}

/** SHA1 hash */
function sha1(input: string): string {
  return crypto.createHash('sha1').update(input, 'utf8').digest('hex')
}

/**
 * 构建单个本地共享的 manifest
 *
 * @param share p2p_local_share 记录
 * @returns BuildManifestResult 或 null(共享无效时)
 */
export async function buildShareManifest(share: {
  p2pLocalShareId: number
  shareType: string
  mediaId: number | null
  mangaId: number | null
  shareName: string
}): Promise<BuildManifestResult | null> {
  const identity = p2pIdentityService.getIdentity()
  if (!identity) return null

  const nodeVersion: string | undefined = undefined

  // 1) 确定共享的 manga 范围
  let mangaList: Array<{
    mangaId: number
    mangaName: string
    mangaCover: string | null
    describe: string | null
    author: string | null
    chapterCount: number
  }> = []

  let shareCover: string | null = null
  let shareCoverSize: number | null = null
  let shareDescribe: string | null = null

  if (share.shareType === 'media' && share.mediaId) {
    const media = await prisma.media.findUnique({ where: { mediaId: share.mediaId } })
    if (!media) return null
    shareCover = media.mediaCover || null
    shareCoverSize = shareCover ? safeFileSize(shareCover) || null : null

    mangaList = await prisma.manga.findMany({
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
  } else if (share.shareType === 'manga' && share.mangaId) {
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
    mangaList = [manga]
  } else {
    return null
  }

  // 2) 查出所有 chapter 并按 mangaId 分组
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
  for (const c of chapters) {
    const arr = chaptersByManga.get(c.mangaId) || []
    arr.push(c)
    chaptersByManga.set(c.mangaId, arr)
  }

  // 3) 构建 manga + chapter 精简信息(先不带 tree)
  const mangas: ManifestManga[] = mangaList.map((m) => {
    const cs = chaptersByManga.get(m.mangaId) || []
    const manifestChapters: ManifestChapter[] = cs.map((c) => {
      const size = estimateChapterSize(c)
      return {
        remoteChapterId: c.chapterId,
        chapterName: c.chapterName,
        chapterType: c.chapterType,
        size,
        imageCount: c.picNum || 0,
      }
    })
    const mangaTotalSize = manifestChapters.reduce((acc, c) => acc + c.size, 0)
    return {
      remoteMangaId: m.mangaId,
      mangaName: m.mangaName,
      mangaCover: m.mangaCover,
      describe: m.describe,
      author: m.author,
      chapterCount: manifestChapters.length,
      totalSize: mangaTotalSize,
      chapters: manifestChapters,
    }
  })

  const totalChapterCount = mangas.reduce((acc, m) => acc + m.chapterCount, 0)
  const totalSize = mangas.reduce((acc, m) => acc + m.totalSize, 0)

  const payloadBase: ManifestPayload = {
    schema: 'share-manifest/v1',
    generatedAt: Date.now(),
    node: {
      nodeId: identity.nodeId,
      nodeName: identity.nodeName || undefined,
      version: nodeVersion,
    },
    share: {
      shareType: (share.shareType === 'manga' ? 'manga' : 'media'),
      remoteMediaId: share.mediaId,
      remoteMangaId: share.mangaId,
      shareName: share.shareName,
      coverUrl: shareCover,
      coverSize: shareCoverSize,
      describe: shareDescribe,
    },
    stats: {
      mangaCount: mangas.length,
      chapterCount: totalChapterCount,
      totalSize,
    },
    mangas,
  }

  // 4) 尝试附加文件树,若体积超限则剥离
  //    策略:先只附加 chapter 级 tree(精度足够前端展示),先整体尝试一次
  const chapterPathByChapterId = new Map<number, string>()
  for (const c of chapters) chapterPathByChapterId.set(c.chapterId, c.chapterPath)

  // 给所有 chapter 附加 tree
  for (const manga of payloadBase.mangas) {
    for (const ch of manga.chapters) {
      const cp = chapterPathByChapterId.get(ch.remoteChapterId)
      if (!cp) continue
      const tree = scanChapterTree(cp)
      if (tree.length > 0) ch.tree = tree
    }
  }

  let { json, size } = serialize(payloadBase)
  let payloadTruncated = false

  if (size > PAYLOAD_MAX_BYTES) {
    // 超限:剥离所有 tree 字段
    payloadTruncated = true
    for (const manga of payloadBase.mangas) {
      for (const ch of manga.chapters) {
        if (ch.tree) delete ch.tree
      }
    }
    const retry = serialize(payloadBase)
    json = retry.json
    size = retry.size
  }

  const contentHash = sha1(json)

  return {
    payload: payloadBase,
    payloadSize: size,
    payloadTruncated,
    contentHash,
    payloadJson: json,
  }
}