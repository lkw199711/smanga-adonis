import { activeManga, activeChapter } from '#services/library_visibility'
import type { HttpContext } from '@adonisjs/core/http'
import fs from 'node:fs/promises'
import path from 'node:path'
import prisma from '#start/prisma'
import {
  first_archive_cover_or_image,
  is_img,
  path_cache,
  path_compress,
  path_meta,
  path_poster,
} from '#utils/index'
import { image_mime } from '#utils/opds'
import {
  LibraryPathContext,
  LibraryPathError,
  isWithinLibraryDirectory,
} from '#services/library_path_service'
import {
  cacheCover,
  cacheMetaImage,
  coverCacheFile,
  openCachedCover,
  openCoverFile,
  type CoverKind,
} from '#services/cover_cache_service'
import type { HttpContextWithUserId } from '#type/http'

async function checkedFile(file: string, root: string) {
  const [realFile, realRoot] = await Promise.all([fs.realpath(file), fs.realpath(root)])
  if (!isWithinLibraryDirectory(realRoot, realFile))
    throw new LibraryPathError('封面路径超出存储目录')
  return realFile
}

async function firstExtractedImage(root: string) {
  const files: string[] = []
  async function collect(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) await collect(file)
      else if (entry.isFile() && is_img(entry.name)) files.push(path.relative(root, file))
    }
  }
  await collect(root)
  const chosen = first_archive_cover_or_image(files)
  return chosen ? path.join(root, chosen) : ''
}

export default class CoversController {
  async show(ctx: HttpContext) {
    return serveCover(ctx, ctx.params.kind, ctx.params.id)
  }
}

export async function serveCover(
  { request, response }: HttpContext,
  kind: CoverKind | string,
  rawId: string
) {
  const id = Number(rawId)
  if (
    (kind !== 'manga' && kind !== 'chapter' && kind !== 'meta') ||
    !/^\d+$/.test(rawId) ||
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    return response.status(400).json({ message: '图片标识无效' })
  }

  const user = (request as HttpContextWithUserId['request']).user
  if (!user) return response.status(401).json({ message: '请先登录' })

  const media = { select: { isCloudMedia: true, deleteFlag: true } } as const
  const manga =
    kind === 'manga'
      ? await prisma.manga.findUnique({
          where: { mangaId: id, ...activeManga },
          include: { media },
        })
      : null
  const chapter =
    kind === 'chapter'
      ? await prisma.chapter.findUnique({
          where: { chapterId: id, ...activeChapter },
          include: { media, manga: { select: { deleteFlag: true } } },
        })
      : null
  const meta =
    kind === 'meta'
      ? await prisma.meta.findUnique({
          where: { metaId: id, manga: activeManga },
          include: { manga: { include: { media } }, chapter: { select: { deleteFlag: true } } },
        })
      : null
  const item = manga ?? chapter ?? meta?.manga
  const missing = () => response.status(404).json({ message: '图片不存在' })
  if (
    !item ||
    item.deleteFlag ||
    item.media.deleteFlag ||
    chapter?.manga.deleteFlag ||
    meta?.chapter?.deleteFlag
  )
    return missing()
  if (
    user.role !== 'admin' &&
    user.mediaPermit !== 'all' &&
    !user.mediaPermissons?.some((entry: { mediaId: number }) => entry.mediaId === item.mediaId)
  ) {
    return response.status(403).json({ message: '没有权限访问图片' })
  }

  const stored = manga?.mangaCover ?? chapter?.chapterCover ?? meta?.metaFile
  const cloud = item.media.isCloudMedia === 1
  const cacheOnly = kind === 'meta' && request.qs().cacheOnly === '1'
  const send = (stream: Awaited<ReturnType<typeof openCoverFile>>, mime: string) => {
    response.header('Content-Type', mime)
    response.header('Cache-Control', 'private, no-cache')
    return response.stream(stream)
  }

  try {
    if (stored && !is_img(stored)) return missing()
    if (stored && path.isAbsolute(stored)) {
      const managed = [path_poster(), path_meta(), path_cache()].find((root) =>
        isWithinLibraryDirectory(root, stored)
      )
      if (managed)
        return send(await openCoverFile(await checkedFile(stored, managed)), image_mime(stored))
    }
    if (!stored && (!cloud || !chapter || !['zip', 'rar', '7z'].includes(chapter.chapterType)))
      return missing()

    const scanPath = await prisma.path.findUnique({
      where: { pathId: item.pathId },
      include: { storageRoot: true },
    })
    if (!scanPath || scanPath.deleteFlag || scanPath.mediaId !== item.mediaId) return missing()
    const library = new LibraryPathContext(scanPath)

    if (stored) {
      const source = path.resolve(library.resolveDataPath(stored))
      const root = path.resolve(library.resolve(scanPath.pathContent))
      // Older cover choices can reference an image beside the library directory.
      const base = library.rootPath ?? root
      if (!isWithinLibraryDirectory(base, source)) return missing()
      if (!cloud) {
        if (cacheOnly) return missing()
        return send(await openCoverFile(await checkedFile(source, base)), image_mime(source))
      }

      const file = coverCacheFile(
        kind,
        id,
        JSON.stringify([
          1,
          item.pathId,
          library.storageRootId,
          stored,
          meta?.updateTime ?? item.updateTime,
        ])
      )
      const mime = kind === 'meta' ? image_mime(source) : 'image/webp'
      const cached = await openCachedCover(file)
      if (cached) return send(cached, mime)
      if (cacheOnly) return missing()
      const cache = kind === 'meta' ? cacheMetaImage : cacheCover
      return send(await cache(file, () => checkedFile(source, base)), mime)
    }

    // A cover from inside an archive can be generated after reading has produced a local extraction.
    const compress = await prisma.compress.findUnique({ where: { chapterId: id } })
    if (
      !compress ||
      compress.compressStatus !== 'compressed' ||
      !isWithinLibraryDirectory(path_compress(), compress.compressPath)
    )
      return missing()
    const file = coverCacheFile(
      kind,
      id,
      JSON.stringify([
        1,
        item.pathId,
        library.storageRootId,
        chapter!.chapterPath,
        item.updateTime,
        compress.updateTime,
        'extracted',
      ])
    )
    const cached = await openCachedCover(file)
    if (cached) return send(cached, 'image/webp')
    const stream = await cacheCover(file, async () => {
      const dir = await checkedFile(compress.compressPath, path_compress())
      const source = await firstExtractedImage(dir)
      if (!source) throw Object.assign(new Error('解压目录中没有图片'), { code: 'ENOENT' })
      return source
    })
    return send(stream, 'image/webp')
  } catch (error) {
    if (error instanceof LibraryPathError) return missing()
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return missing()
    return response.status(503).json({ message: '图片暂时无法读取' })
  }
}
