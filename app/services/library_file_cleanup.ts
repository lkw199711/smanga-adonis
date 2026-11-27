import fs from 'node:fs'
import path from 'node:path'
import type { Prisma } from '@prisma/client'
import prisma from '#start/prisma'
import { path_bookmark, path_compress, path_poster } from '#utils/index'
import { isWithinLibraryDirectory, LibraryPathContext } from './library_path_service.js'
import { resolvePhysicalDeleteTarget } from './physical_delete_service.js'

type SourceIdentity = { realTarget: string; realRoot: string; dev: string; ino: string }
export type FileTask = {
  kind: 'bookmark' | 'compress' | 'poster' | 'source'
  target: string
  root: string
  allowRoot?: boolean
  identity?: SourceIdentity
  pathId?: number
}

export function managedFile(
  kind: FileTask['kind'],
  target: string | null | undefined,
  root: string
) {
  if (
    target &&
    path.isAbsolute(target) &&
    path.resolve(target) !== path.resolve(root) &&
    isWithinLibraryDirectory(root, target)
  ) {
    return { kind, target, root }
  }
}

function sourceIdentity(target: string, root: string): SourceIdentity {
  const stat = fs.lstatSync(target, { bigint: true })
  if (stat.isSymbolicLink()) throw new Error('实体删除目标是符号链接')
  return {
    realTarget: fs.realpathSync(target),
    realRoot: fs.realpathSync(root),
    dev: String(stat.dev),
    ino: String(stat.ino),
  }
}

export function sourceFile(target: string, root: string, allowRoot = false): FileTask | undefined {
  if (!path.isAbsolute(target) || !path.isAbsolute(root)) {
    throw new Error('实体删除需要明确的绝对路径')
  }
  fs.realpathSync(root)
  const appData = path.dirname(path_poster())
  if (overlap(realOrResolved(target), realOrResolved(appData))) {
    throw new Error('实体删除目标与应用数据目录重叠')
  }
  const resolved = resolvePhysicalDeleteTarget(target, root, { allowRoot })
  try {
    return {
      kind: 'source',
      target: resolved,
      root,
      allowRoot,
      identity: sourceIdentity(resolved, root),
    }
  } catch (error: any) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

export function overlap(left: string, right: string) {
  return isWithinLibraryDirectory(left, right) || isWithinLibraryDirectory(right, left)
}

export function realOrResolved(value: string) {
  try {
    return fs.realpathSync(value)
  } catch (error: any) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return path.resolve(value)
    throw error
  }
}

export async function checkOtherLibraries(tx: Prisma.TransactionClient, file: FileTask, pathIds: number[]) {
  const paths = await tx.path.findMany({
    where: { pathId: { notIn: pathIds } },
    include: { storageRoot: true },
  })
  for (const record of paths) {
    const storageRoot = record.storageRoot
      ? { ...record.storageRoot, enabled: 1, deleteFlag: 0 }
      : null
    const context = new LibraryPathContext({ ...record, storageRoot })
    const other = context.resolve(record.pathContent)
    if (
      overlap(path.resolve(file.target), path.resolve(other)) ||
      overlap(file.identity!.realTarget, realOrResolved(other))
    ) {
      throw new Error('实体文件与其他媒体库路径重叠')
    }
  }
}

export async function deleteLibraryFile(file: FileTask) {
  if (file.kind === 'source') {
    if (!file.identity) throw new Error('缺少源文件标识')
    let identity
    try {
      // Verify the mount first; a missing mount is a failure, not a missing file.
      fs.realpathSync(file.root)
      identity = sourceIdentity(file.target, file.root)
    } catch (error: any) {
      if (error?.code === 'ENOENT' && (file.allowRoot || fs.existsSync(file.root))) return
      throw error
    }
    if (
      Object.keys(identity).some(
        (key) =>
          identity[key as keyof SourceIdentity] !== file.identity![key as keyof SourceIdentity]
      )
    ) {
      throw new Error('源文件或存储根已变更，已拒绝删除')
    }
    await checkOtherLibraries(prisma, file, file.pathId ? [file.pathId] : [])
    if (file.pathId) {
      const record = await prisma.path.findUnique({
        where: { pathId: file.pathId },
        include: { storageRoot: true },
      })
      if (record) {
        const context = new LibraryPathContext(record)
        const [mangas, chapters] = await Promise.all([
          prisma.manga.findMany({ where: { pathId: file.pathId }, select: { mangaPath: true } }),
          prisma.chapter.findMany({
            where: { pathId: file.pathId },
            select: { chapterPath: true },
          }),
        ])
        const used = [
          ...mangas.map((item) => item.mangaPath),
          ...chapters.map((item) => item.chapterPath),
        ]
        if (
          used.some((item) =>
            isWithinLibraryDirectory(identity.realTarget, realOrResolved(context.resolve(item)))
          )
        ) {
          throw new Error('源文件仍被其他记录引用')
        }
      }
    }
  } else {
    const roots = { bookmark: path_bookmark(), compress: path_compress(), poster: path_poster() }
    if (path.resolve(file.root) !== path.resolve(roots[file.kind])) {
      throw new Error('缓存目录已变更，已拒绝删除')
    }
    if (
      file.kind === 'bookmark' &&
      (await prisma.bookmark.count({ where: { pageImage: file.target } }))
    )
      return
    if (
      file.kind === 'compress' &&
      (await prisma.compress.count({ where: { compressPath: file.target } }))
    )
      return
  }
  const target = resolvePhysicalDeleteTarget(file.target, file.root, { allowRoot: file.allowRoot })
  await fs.promises.rm(target, { force: true, recursive: true })
}
