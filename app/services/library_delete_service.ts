import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import prisma from '#start/prisma'
import { TaskPriority } from '#type/index'
import { path_bookmark, path_compress, path_poster } from '#utils/index'
import {
  LibraryPathContext,
  isManagedCover,
  isWithinLibraryDirectory,
} from './library_path_service.js'
import {
  checkOtherLibraries,
  managedFile,
  overlap,
  realOrResolved,
  sourceFile,
  type FileTask,
} from './library_file_cleanup.js'
import { getQueueName } from './queue/queue_config.js'
import {
  activeLibraryDeletionScopes,
  decodeJson,
  libraryDeletionOverlaps,
  queueJobData,
  toJobLike,
  type LibraryDeletionKind as Kind,
} from './queue/sql_queue_repository.js'

type Tx = Prisma.TransactionClient
type Container = 'media' | 'path'

const commands = {
  media: 'deleteMedia',
  path: 'deletePath',
  manga: 'deleteManga',
  chapter: 'deleteChapter',
}
const taskName = (kind: Kind, id: number) => `delete_${kind}_${id}_purge`

export class LibraryDeleteConflict extends Error {}
export class LibraryDeleteNotFound extends Error {}

function writeTransaction<T>(action: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(action, { isolationLevel: 'Serializable', timeout: 60_000 })
}

function activeJob(tx: Tx, name: string) {
  return tx.queue_job.findFirst({
    orderBy: { id: 'desc' },
    where: {
      queue_name: getQueueName(),
      task_name: name,
      status: { in: ['pending', 'running'] },
    },
  })
}

async function setContainerHidden(tx: Tx, kind: Container, ids: number[], hidden: boolean) {
  const deleteFlag = hidden ? 1 : 0
  if (kind === 'media') {
    return tx.media.updateMany({ where: { mediaId: { in: ids } }, data: { deleteFlag } })
  }
  return tx.path.updateMany({ where: { pathId: { in: ids } }, data: { deleteFlag } })
}

async function queueShareRefresh(tx: Tx, ids: { mediaIds: number[]; mangaIds: number[] }) {
  const groups = new Set<string>()
  for (const [key, values] of Object.entries(ids)) {
    for (let index = 0; index < values.length; index += 500) {
      const batch = values.slice(index, index + 500)
      const where = key === 'mediaIds' ? { mediaId: { in: batch } } : { mangaId: { in: batch } }
      const rows = await tx.p2p_group.findMany({
        where: { localShares: { some: where } },
        select: { groupNo: true },
      })
      rows.forEach((group) => groups.add(group.groupNo))
    }
  }
  for (const groupNo of groups) {
    await tx.queue_job.create({
      data: queueJobData({
        taskQueue: 'scan',
        taskName: `announce_library_change_${groupNo}`,
        command: 'announceAfterScan',
        args: { groupNo },
        priority: TaskPriority.announceP2P,
      }),
    })
  }
}

async function containerShareIds(tx: Tx, kind: Container, ids: number[]) {
  const configured = await tx.p2p_local_share.findFirst({
    where: { enable: 1 },
    select: { p2pLocalShareId: true },
  })
  if (!configured) return { mediaIds: [], mangaIds: [] }
  const where = kind === 'media' ? { mediaId: { in: ids } } : { pathId: { in: ids } }
  const mangas = await tx.manga.findMany({ where, select: { mangaId: true, mediaId: true } })
  const paths = kind === 'path' ? await tx.path.findMany({ where, select: { mediaId: true } }) : []
  return {
    mediaIds: kind === 'media' ? ids : [...new Set(paths.map((item) => item.mediaId))],
    mangaIds: mangas.map((item) => item.mangaId),
  }
}

export async function hideLibraryContainer(kind: Container, ids: number[]) {
  return writeTransaction(async (tx) => {
    const result = await setContainerHidden(tx, kind, ids, true)
    if (result.count) await queueShareRefresh(tx, await containerShareIds(tx, kind, ids))
    return result
  })
}

export async function restoreLibraryContainer(kind: Container, id: number) {
  return writeTransaction(async (tx) => {
    const record =
      kind === 'media'
        ? await tx.media.findUnique({ where: { mediaId: id } })
        : await tx.path.findUnique({
            where: { pathId: id },
            include: { media: true, storageRoot: true },
          })
    if (!record) throw new LibraryDeleteNotFound('记录不存在')
    const parentPurge =
      'media' in record && (await activeJob(tx, taskName('media', record.mediaId)))
    if (parentPurge || (await activeJob(tx, taskName(kind, id)))) {
      throw new LibraryDeleteConflict('永久清理任务正在执行')
    }
    if ('media' in record && record.media.deleteFlag) {
      throw new LibraryDeleteConflict('请先恢复所属媒体库')
    }
    if (
      'storageRoot' in record &&
      record.storageRootId &&
      (!record.storageRoot || record.storageRoot.deleteFlag || !record.storageRoot.enabled)
    ) {
      throw new LibraryDeleteConflict('请先恢复关联的存储根')
    }
    await tx.queue_failed_job.deleteMany({
      where: { queue_name: getQueueName(), task_name: taskName(kind, id) },
    })
    await setContainerHidden(tx, kind, [id], false)
    if (record.deleteFlag) await queueShareRefresh(tx, await containerShareIds(tx, kind, [id]))
    return { ...record, deleteFlag: 0 }
  })
}

async function deletionScope(tx: Tx, kind: Kind, id: number) {
  switch (kind) {
    case 'media':
      return tx.media.findUnique({ where: { mediaId: id }, select: { mediaId: true } })
    case 'path':
      return tx.path.findUnique({ where: { pathId: id }, select: { mediaId: true, pathId: true } })
    case 'manga':
      return tx.manga.findUnique({
        where: { mangaId: id },
        select: { mediaId: true, pathId: true, mangaId: true },
      })
    case 'chapter':
      return tx.chapter.findUnique({
        where: { chapterId: id },
        select: { mediaId: true, pathId: true, mangaId: true, chapterId: true },
      })
  }
}

export async function submitLibraryDeletion(kind: Kind, ids: number[], deleteFile: boolean) {
  return writeTransaction(async (tx) => {
    if (deleteFile) {
      const requested =
        kind === 'media'
          ? await tx.media.findMany({
              where: { mediaId: { in: ids } },
              select: { isCloudMedia: true },
            })
          : kind === 'path'
            ? await tx.media.findMany({
                where: { paths: { some: { pathId: { in: ids } } } },
                select: { isCloudMedia: true },
              })
            : []
      if (requested.some((media) => media.isCloudMedia)) {
        throw new LibraryDeleteConflict('云媒体库不支持删除本地实体文件')
      }
    }

    const scopes = await activeLibraryDeletionScopes(tx)
    const jobs = []
    for (const id of new Set(ids)) {
      const name = taskName(kind, id)
      const existing = await activeJob(tx, name)
      if (existing) {
        if (deleteFile && !decodeJson(existing.args)?.deleteFile) {
          throw new LibraryDeleteConflict('已有记录清理任务，请等待完成后处理源文件')
        }
        jobs.push(toJobLike(existing))
        continue
      }

      const scope = await deletionScope(tx, kind, id)
      if (!scope) continue
      if (scopes.some((other) => libraryDeletionOverlaps({ kind, scope }, other))) {
        throw new LibraryDeleteConflict('上级或下级记录已有永久清理任务')
      }
      const result =
        kind === 'media' || kind === 'path'
          ? await setContainerHidden(tx, kind, [id], true)
          : kind === 'manga'
            ? await tx.manga.updateMany({ where: { mangaId: id }, data: { deleteFlag: 1 } })
            : await tx.chapter.updateMany({ where: { chapterId: id }, data: { deleteFlag: 1 } })
      if (!result.count) continue

      const job = await tx.queue_job.create({
        data: queueJobData({
          taskQueue: 'scan',
          taskName: name,
          command: commands[kind],
          args: { [`${kind}Id`]: id, kind, scope, deleteFile, purge: true },
          priority: TaskPriority.deleteManga,
        }),
      })
      jobs.push(toJobLike(job))
    }
    return jobs
  })
}

async function queueFiles(tx: Tx, files: FileTask[]) {
  const jobs = new Map<string, ReturnType<typeof queueJobData>>()
  for (const file of files) {
    const key = createHash('sha256').update(JSON.stringify(file)).digest('hex')
    jobs.set(
      key,
      queueJobData({
        taskQueue: 'scan',
        taskName: `delete_library_file_${key}`,
        command: 'deleteLibraryFile',
        args: file,
        priority: TaskPriority.deleteFile,
        timeout: 600_000,
      })
    )
  }
  const data = [...jobs.values()]
  for (let i = 0; i < data.length; i += 50) {
    await tx.queue_job.createMany({ data: data.slice(i, i + 50) })
  }
}

type Dependents = {
  OR?: Array<{ manga: Prisma.mangaWhereInput } | { chapter: Prisma.chapterWhereInput }>
  chapterId?: number
}

async function clearDependents(tx: Tx, where: Dependents, files: FileTask[]) {
  const [bookmarks, compresses] = await Promise.all([
    tx.bookmark.findMany({ where, select: { pageImage: true } }),
    tx.compress.findMany({ where, select: { compressPath: true } }),
  ])
  for (const { pageImage } of bookmarks) {
    if (!pageImage || !path.basename(pageImage).startsWith('smanga_bookmark_')) continue
    const file = managedFile('bookmark', pageImage, path_bookmark())
    if (file) files.push(file)
  }
  for (const { compressPath } of compresses) {
    if (!path.basename(compressPath).startsWith('smanga_chapter_')) continue
    const file = managedFile('compress', compressPath, path_compress())
    if (file) files.push(file)
  }

  await tx.bookmark.deleteMany({ where })
  await tx.collect.deleteMany({ where })
  await tx.compress.deleteMany({ where })
  await tx.history.deleteMany({ where })
  await tx.latest.deleteMany({ where })
  await tx.meta.deleteMany({ where })
}

function collectCover(
  files: FileTask[],
  kind: 'manga' | 'chapter',
  id: number,
  target: string | null
) {
  if (target && isManagedCover(target, kind, id)) {
    files.push({ kind: 'poster', target, root: path_poster() })
  }
}

async function clearMangas(tx: Tx, where: Prisma.mangaWhereInput, files: FileTask[]) {
  const mangas = await tx.manga.findMany({
    where,
    select: { mangaId: true, mangaCover: true },
  })
  const chaptersWhere = { manga: where }
  const chapters = await tx.chapter.findMany({
    where: chaptersWhere,
    select: { chapterId: true, chapterCover: true },
  })
  await clearDependents(tx, { OR: [{ manga: where }, { chapter: chaptersWhere }] }, files)
  await tx.mangaTag.deleteMany({ where: { manga: where } })
  await tx.share.deleteMany({ where: { manga: where } })
  for (const item of mangas) collectCover(files, 'manga', item.mangaId, item.mangaCover)
  for (const item of chapters) collectCover(files, 'chapter', item.chapterId, item.chapterCover)
  const mangaIds = mangas.map((item) => item.mangaId)
  for (let i = 0; i < mangaIds.length; i += 500) {
    await tx.p2p_local_share.updateMany({
      where: { mangaId: { in: mangaIds.slice(i, i + 500) } },
      data: { enable: 0 },
    })
  }
  await tx.chapter.deleteMany({ where: chaptersWhere })
  await tx.manga.deleteMany({ where })
}

export async function purgeManga(mangaId: number, deleteFile: boolean, scanPathId?: number) {
  await writeTransaction(async (tx) => {
    const manga = await tx.manga.findUnique({
      where: { mangaId },
      include: { path: { include: { storageRoot: true } }, media: true },
    })
    if (!manga) return
    if (scanPathId) {
      if (
        manga.pathId !== scanPathId ||
        manga.deleteFlag ||
        manga.path.deleteFlag ||
        manga.media.deleteFlag
      )
        return
      const context = new LibraryPathContext(manga.path)
      context.scanDirectory(manga.path.pathContent)
      try {
        fs.statSync(context.resolve(manga.mangaPath))
        return
      } catch (error: any) {
        if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error
      }
    }
    const files: FileTask[] = []
    if (deleteFile) {
      if (manga.media.isCloudMedia)
        throw new LibraryDeleteConflict('云媒体库不支持删除本地实体文件')
      const context = new LibraryPathContext(manga.path)
      const root = context.scanDirectory(manga.path.pathContent)
      const file = sourceFile(context.resolve(manga.mangaPath), root)
      if (file) {
        await checkOtherLibraries(tx, file, [manga.pathId])
        const others = await tx.manga.findMany({
          where: { pathId: manga.pathId, mangaId: { not: mangaId } },
          select: { mangaPath: true },
        })
        if (
          others.some((item) =>
            overlap(file.identity!.realTarget, realOrResolved(context.resolve(item.mangaPath)))
          )
        ) {
          throw new LibraryDeleteConflict('源文件与同一路径下其他漫画重叠')
        }
        files.push({ ...file, pathId: manga.pathId })
      }
    }
    await queueShareRefresh(tx, { mediaIds: [manga.mediaId], mangaIds: [mangaId] })
    await clearMangas(tx, { mangaId }, files)
    await queueFiles(tx, files)
  })
}

export async function purgeChapter(chapterId: number, deleteFile: boolean, scanPathId?: number) {
  await writeTransaction(async (tx) => {
    const chapter = await tx.chapter.findUnique({
      where: { chapterId },
      include: { media: true, manga: { include: { path: { include: { storageRoot: true } } } } },
    })
    if (!chapter) return
    if (
      scanPathId &&
      (chapter.pathId !== scanPathId ||
        chapter.deleteFlag ||
        chapter.manga.path.deleteFlag ||
        chapter.media.deleteFlag)
    )
      return
    const files: FileTask[] = []
    if (deleteFile) {
      const { manga } = chapter
      if (
        chapter.media.isCloudMedia ||
        chapter.pathId !== manga.pathId ||
        chapter.mediaId !== manga.mediaId
      ) {
        throw new LibraryDeleteConflict('章节的媒体库和路径无法确认，已拒绝删除源文件')
      }
      const context = new LibraryPathContext(manga.path)
      const file = sourceFile(
        context.resolve(chapter.chapterPath),
        context.scanDirectory(manga.path.pathContent)
      )
      if (file) {
        await checkOtherLibraries(tx, file, [manga.pathId])
        const chapters = await tx.chapter.findMany({
          where: { pathId: manga.pathId, chapterId: { not: chapterId } },
          select: { chapterPath: true },
        })
        if (
          isWithinLibraryDirectory(
            file.identity!.realTarget,
            realOrResolved(context.resolve(manga.mangaPath))
          ) ||
          chapters.some((item) =>
            overlap(file.identity!.realTarget, realOrResolved(context.resolve(item.chapterPath)))
          )
        ) {
          throw new LibraryDeleteConflict('源文件同时属于漫画或其他章节，请从漫画层级操作')
        }
        files.push({ ...file, pathId: manga.pathId })
      }
    }
    await clearDependents(tx, { chapterId }, files)
    collectCover(files, 'chapter', chapterId, chapter.chapterCover)
    await tx.chapter.delete({ where: { chapterId } })
    const mangaId = chapter.mangaId
    const chapterCount = await tx.chapter.count({ where: { mangaId, deleteFlag: 0 } })
    await tx.manga.update({ where: { mangaId }, data: { chapterCount } })
    await tx.mangaScanState.deleteMany({ where: { mangaId } })
    await queueShareRefresh(tx, { mediaIds: [chapter.mediaId], mangaIds: [mangaId] })
    await queueFiles(tx, files)
  })
}

export async function purgeLibraryContainer(kind: Container, id: number, deleteFile: boolean) {
  await writeTransaction(async (tx) => {
    const media =
      kind === 'media' ? await tx.media.findFirst({ where: { mediaId: id, deleteFlag: 1 } }) : null
    const pathRecord =
      kind === 'path' ? await tx.path.findFirst({ where: { pathId: id, deleteFlag: 1 } }) : null
    if (!media && !pathRecord) return

    const where = kind === 'media' ? { mediaId: id } : { pathId: id }
    const paths = await tx.path.findMany({ where, include: { storageRoot: true, media: true } })
    let files: FileTask[] = []
    if (deleteFile) {
      // A media purge owns active bindings only; individually archived paths may have been detached.
      const owned = kind === 'media' ? paths.filter((record) => !record.deleteFlag) : paths
      const ownedIds = owned.map((record) => record.pathId)
      for (const record of owned) {
        if (record.media.isCloudMedia)
          throw new LibraryDeleteConflict('云媒体库不支持删除本地实体文件')
        const context = new LibraryPathContext(record)
        const target = context.resolve(record.pathContent)
        const file = sourceFile(target, context.rootPath ?? target, !context.usesStorageRoot)
        if (!file) continue
        await checkOtherLibraries(tx, file, ownedIds)
        files.push(file)
      }
      // An ancestor target already covers the subtree of a selected nested binding.
      files = files.filter(
        (file, index) =>
          !files.some(
            (other, otherIndex) =>
              otherIndex !== index &&
              isWithinLibraryDirectory(other.identity!.realTarget, file.identity!.realTarget) &&
              (other.identity!.realTarget !== file.identity!.realTarget || otherIndex < index)
          )
      )
    }
    await queueShareRefresh(tx, await containerShareIds(tx, kind, [id]))
    await clearMangas(tx, where, files)
    if (media) {
      await tx.share.deleteMany({ where: { mediaId: id } })
      await tx.mediaPermisson.deleteMany({ where: { mediaId: id } })
      await tx.p2p_local_share.updateMany({ where: { mediaId: id }, data: { enable: 0 } })
      const poster = path.join(path_poster(), `smanga_media_${id}.jpg`)
      files.push({ kind: 'poster', target: poster, root: path_poster() })
      await tx.path.deleteMany({ where: { mediaId: id } })
      await tx.media.delete({ where: { mediaId: id } })
    } else {
      await tx.path.delete({ where: { pathId: id } })
    }
    await queueFiles(tx, files)
  })
}
