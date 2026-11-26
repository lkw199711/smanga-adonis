import path from 'node:path'
import prisma from '#start/prisma'
import {
  LibraryPathContext,
  LibraryPathError,
  type PathWithStorageRoot,
} from './library_path_service.js'

type FileFields = {
  mangaCover?: string | null
  chapterCover?: string | null
  metaFile?: string | null
}

type LibraryFileRecord = FileFields & {
  pathId?: number | bigint | null
  metas?: readonly Pick<FileFields, 'metaFile'>[]
}

const fileFields = ['mangaCover', 'chapterCover', 'metaFile'] as const
type LoadPaths = (pathIds: number[]) => Promise<Array<PathWithStorageRoot & { pathId: number }>>

const loadPaths: LoadPaths = (pathIds) =>
  prisma.path.findMany({
    where: { pathId: { in: pathIds } },
    select: {
      pathId: true,
      storageRootId: true,
      storageRoot: {
        select: { storageRootId: true, rootPath: true, enabled: true, deleteFlag: true },
      },
    },
  })

function isRelativeFile(file: string | null | undefined): file is string {
  return Boolean(file && !path.isAbsolute(file))
}

/**
 * Resolve file references at the response boundary. Only rows with relative
 * files need a path lookup, and each storage root is reused within the batch.
 */
export async function resolveLibraryFiles<T extends LibraryFileRecord | null>(
  records: readonly T[],
  readPaths = loadPaths
): Promise<T[]> {
  const pathIds = new Set<number>()
  for (const record of records) {
    if (
      record?.pathId &&
      (fileFields.some((field) => isRelativeFile(record[field])) ||
        record.metas?.some((meta) => isRelativeFile(meta.metaFile)))
    ) {
      pathIds.add(Number(record.pathId))
    }
  }
  if (!pathIds.size) return [...records]

  const paths = await readPaths([...pathIds])
  const roots = new Map<number | null, LibraryPathContext | null>()
  const contexts = new Map<number, LibraryPathContext | null>()
  for (const entry of paths) {
    const rootId = entry.storageRootId ?? null
    if (!roots.has(rootId)) {
      try {
        roots.set(rootId, new LibraryPathContext(entry))
      } catch (error) {
        if (!(error instanceof LibraryPathError)) throw error
        roots.set(rootId, null)
      }
    }
    contexts.set(entry.pathId, roots.get(rootId) ?? null)
  }

  return records.map((record) => {
    if (!record?.pathId) return record

    const context = contexts.get(Number(record.pathId))
    const resolveFile = (file: string | null | undefined) => {
      if (!isRelativeFile(file)) return file
      if (!context) return null
      try {
        return context.resolveDataPath(file)
      } catch (error) {
        if (!(error instanceof LibraryPathError)) throw error
        return null
      }
    }

    const resolved = { ...record }
    for (const field of fileFields) {
      if (field in record) resolved[field] = resolveFile(record[field])
    }
    if (record.metas) {
      resolved.metas = record.metas.map((meta) => ({
        ...meta,
        metaFile: resolveFile(meta.metaFile),
      }))
    }
    return resolved
  })
}

export async function resolveLibraryFileRecord<T extends LibraryFileRecord>(
  record: T | null
): Promise<T | null> {
  if (!record) return null
  const [resolved] = await resolveLibraryFiles([record])
  return resolved
}
