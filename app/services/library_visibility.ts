import type { Prisma } from '@prisma/client'
import prisma from '#start/prisma'
import {
  isWithinLibraryDirectory,
  LibraryPathContext,
  LibraryPathError,
} from './library_path_service.js'

export const activePath = {
  deleteFlag: 0,
  media: { deleteFlag: 0 },
} satisfies Prisma.pathWhereInput

export const activeManga = {
  deleteFlag: 0,
  media: { deleteFlag: 0 },
  path: { deleteFlag: 0 },
} satisfies Prisma.mangaWhereInput

export const activeChapter = {
  deleteFlag: 0,
  media: { deleteFlag: 0 },
  manga: activeManga,
} satisfies Prisma.chapterWhereInput

export async function archivedLibraryRoots() {
  const paths = await prisma.path.findMany({
    where: { OR: [{ deleteFlag: 1 }, { media: { deleteFlag: 1 } }] },
    include: { storageRoot: true },
  })
  const roots = new Set<string>()
  for (const record of paths) {
    const storageRoot = record.storageRoot
      ? { ...record.storageRoot, deleteFlag: 0, enabled: 1 }
      : null
    try {
      const root = new LibraryPathContext({ ...record, storageRoot }).resolve(record.pathContent)
      roots.add(root)
    } catch (error) {
      if (!(error instanceof LibraryPathError)) throw error
    }
  }
  return [...roots]
}

export async function isArchivedLibraryFile(file: string, roots?: string[]) {
  const archived = roots ?? (await archivedLibraryRoots())
  return archived.some((root) => isWithinLibraryDirectory(root, file))
}
