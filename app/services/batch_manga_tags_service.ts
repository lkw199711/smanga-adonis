import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Prisma } from '@prisma/client'
import prisma from '#start/prisma'
import { activeChapter, activeManga } from './library_visibility.js'
import { isWithinLibraryDirectory, LibraryPathContext } from './library_path_service.js'

type BatchTagsInput = {
  target: 'manga' | 'chapter'
  ids: number[]
  operation: 'add' | 'remove' | 'replace'
  tagIds: number[]
  metaWriteJson?: boolean
}

export class BatchTagsError extends Error {}

async function updateTags(tx: Prisma.TransactionClient, input: BatchTagsInput) {
  const ids = [...new Set(input.ids)]
  const tagIds = [...new Set(input.tagIds)]
  if (!tagIds.length && input.operation !== 'replace') {
    throw new BatchTagsError('请选择至少一个标签')
  }

  let mangaIds = ids
  if (input.target === 'chapter') {
    const chapters = await tx.chapter.findMany({
      where: { ...activeChapter, chapterId: { in: ids } },
      select: { mangaId: true },
    })
    if (chapters.length !== ids.length) throw new BatchTagsError('部分章节已不可用，请刷新后重试')
    mangaIds = [...new Set(chapters.map((chapter) => chapter.mangaId))]
  }
  const mangaCount = await tx.manga.count({
    where: { ...activeManga, mangaId: { in: mangaIds } },
  })
  if (mangaCount !== mangaIds.length) throw new BatchTagsError('部分漫画已不可用，请刷新后重试')

  const tagCount = await tx.tag.count({ where: { tagId: { in: tagIds } } })
  if (tagCount !== tagIds.length) throw new BatchTagsError('部分标签已不存在，请重新选择')

  const links = { mangaId: { in: mangaIds } }
  if (input.operation === 'remove') {
    await tx.mangaTag.deleteMany({ where: { ...links, tagId: { in: tagIds } } })
  } else {
    if (input.operation === 'replace') {
      await tx.mangaTag.deleteMany({
        where: tagIds.length ? { ...links, tagId: { notIn: tagIds } } : links,
      })
    }
    if (tagIds.length) {
      const existing = await tx.mangaTag.findMany({
        where: { ...links, tagId: { in: tagIds } },
        select: { mangaId: true, tagId: true },
      })
      const assigned = new Set(existing.map(({ mangaId, tagId }) => `${mangaId}:${tagId}`))
      const additions = mangaIds.flatMap((mangaId) =>
        tagIds.filter((tagId) => !assigned.has(`${mangaId}:${tagId}`)).map((tagId) => ({ mangaId, tagId }))
      )
      for (let start = 0; start < additions.length; start += 200) {
        await tx.mangaTag.createMany({ data: additions.slice(start, start + 200) })
      }
    }
  }
  return mangaIds
}

async function commitTags(input: BatchTagsInput) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => updateTags(tx, input), {
        isolationLevel: 'Serializable',
        timeout: 30_000,
      })
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2002')
      if (!retryable || attempt >= 3) throw error
    }
  }
}

async function syncMangaTags(mangaId: number) {
  const manga = await prisma.manga.findUniqueOrThrow({
    where: { ...activeManga, mangaId },
    include: {
      media: { select: { isCloudMedia: true } },
      path: { include: { storageRoot: true } },
      mangaTags: { include: { tag: true }, orderBy: { tagId: 'asc' } },
    },
  })
  if (manga.media.isCloudMedia) throw new Error('云媒体库不支持写入元数据')
  const context = new LibraryPathContext(manga.path)
  const library = fs.realpathSync(context.resolve(manga.path.pathContent))
  const source = context.resolveDataPath(manga.mangaPath)
  const realSource = fs.realpathSync(source)
  const realParent = fs.realpathSync(path.dirname(source))
  const storageRoot = context.rootPath ? fs.realpathSync(context.rootPath) : null
  if (!isWithinLibraryDirectory(library, realSource) ||
      (realSource !== library && !isWithinLibraryDirectory(library, realParent)) ||
      (storageRoot && !isWithinLibraryDirectory(storageRoot, realParent))) {
    throw new Error('元数据路径超出媒体库目录')
  }

  const directory = source + '-smanga-info'
  const file = path.join(directory, 'meta.json')
  fs.mkdirSync(directory, { recursive: true })
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('元数据目录是符号链接')
  let data: Record<string, unknown> = {}
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('元数据文件是符号链接')
    data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('无效的元数据')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  data.tags = manga.mangaTags.map(({ tag }) => tag.tagName)
  const temporary = path.join(directory, `.meta-${randomUUID()}.tmp`)
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(temporary, file)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

export async function batchMangaTags(input: BatchTagsInput) {
  const mangaIds = await commitTags(input)
  const metadataFailedIds: number[] = []
  if (input.metaWriteJson) {
    for (const mangaId of mangaIds) {
      try {
        await syncMangaTags(mangaId)
      } catch {
        metadataFailedIds.push(mangaId)
      }
    }
  }
  return { count: mangaIds.length, metadataFailedIds }
}
