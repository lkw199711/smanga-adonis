import fs from 'node:fs'
import path from 'node:path'
import prisma from '#start/prisma'
import { addTask } from '#services/queue_service'
import { TaskPriority } from '#type/index'
import { announce_group } from '../p2p_announce_service.js'
import { resolvePathShareMangas } from '../path_share_resolver.js'
import { safeName } from './pull_context.js'

const ARCHIVE_EXTS = new Set(['.zip', '.cbz', '.cbr', '.epub', '.rar', '.7z', '.pdf'])
// Hard switch for pull-success local import/share finalization.
// Keep disabled while validating the basic pull pipeline.
const ENABLE_PULL_AUTO_LOCAL_SHARE_FINALIZE = false

function isArchiveLike(filePath: string) {
  return ARCHIVE_EXTS.has(path.extname(filePath).toLowerCase())
}

function listVisibleEntries(dir: string) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.name !== '.' && entry.name !== '..' && !/^\./.test(entry.name))
}

function guessMediaTypeForPath(rootPath: string) {
  const entries = listVisibleEntries(rootPath).filter((entry) => !/smanga-info/i.test(entry.name))
  let hasMangaDir = false
  let hasArchiveFile = false

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name)
    if (entry.isDirectory()) {
      hasMangaDir = true
      continue
    }
    if (entry.isFile() && isArchiveLike(entryPath)) {
      hasArchiveFile = true
    }
  }

  if (hasMangaDir) return 0
  if (hasArchiveFile) return 1
  return 0
}

async function buildUniqueMediaName(baseName: string) {
  const normalized = (baseName || 'P2P Import').trim() || 'P2P Import'
  let candidate = normalized
  let counter = 2

  while (await prisma.media.findFirst({ where: { mediaName: candidate } })) {
    candidate = `${normalized} (${counter})`
    counter += 1
  }

  return candidate
}

async function resolveOrCreateScanPath(transfer: {
  remoteName: string
  receivedPath: string
}) {
  const receivedPath = path.resolve(transfer.receivedPath)
  const activePath = await prisma.path.findFirst({
    where: { pathContent: receivedPath, deleteFlag: 0 },
    include: { media: true },
    orderBy: { pathId: 'asc' },
  })
  if (activePath) {
    if (activePath.media?.deleteFlag) {
      await prisma.media.update({
        where: { mediaId: activePath.mediaId },
        data: { deleteFlag: 0 },
      })
    }
    return activePath
  }

  const deletedPath = await prisma.path.findFirst({
    where: { pathContent: receivedPath },
    include: { media: true },
    orderBy: { pathId: 'asc' },
  })
  if (deletedPath) {
    const revived = await prisma.path.update({
      where: { pathId: deletedPath.pathId },
      data: { deleteFlag: 0, autoScan: 1 },
      include: { media: true },
    })
    if (revived.media?.deleteFlag) {
      await prisma.media.update({
        where: { mediaId: revived.mediaId },
        data: { deleteFlag: 0 },
      })
    }
    return revived
  }

  const mediaName = await buildUniqueMediaName(`P2P ${transfer.remoteName}`.trim())
  const media = await prisma.media.create({
    data: {
      mediaName,
      mediaType: guessMediaTypeForPath(receivedPath),
      directoryFormat: 0,
      browseType: 'flow',
      direction: 1,
      removeFirst: 0,
      isCloudMedia: 0,
      sourceWebsite: 'p2p',
    },
  })

  return prisma.path.create({
    data: {
      mediaId: media.mediaId,
      pathContent: receivedPath,
      autoScan: 1,
    },
    include: { media: true },
  })
}

async function resolveMangaSharePath(receivedPath: string, remoteName: string) {
  const mangas = await resolvePathShareMangas({
    p2pLocalShareId: 0,
    p2pGroupId: 0,
    shareType: 'media',
    mediaId: null,
    mangaId: null,
    sharePath: receivedPath,
    shareName: remoteName,
  })

  if (!mangas.length) return receivedPath
  if (mangas.length === 1) return mangas[0].mangaPath

  const normalizedRemote = safeName(remoteName)
  const matched = mangas.find((manga) => {
    const baseName = path.basename(manga.mangaPath)
    const baseNoExt = path.basename(manga.mangaPath, path.extname(manga.mangaPath))
    return (
      safeName(manga.mangaName) === normalizedRemote ||
      safeName(baseName) === normalizedRemote ||
      safeName(baseNoExt) === normalizedRemote
    )
  })

  return matched?.mangaPath || mangas[0].mangaPath
}

async function upsertTransferShare(transfer: {
  p2pGroupId: number
  groupNo: string
  transferType: string
  remoteMediaId: number | null
  remoteMangaId: number | null
  remoteName: string
  receivedPath: string
}) {
  if (transfer.transferType !== 'media' && transfer.transferType !== 'manga') return null

  const sharePath =
    transfer.transferType === 'media'
      ? path.resolve(transfer.receivedPath)
      : await resolveMangaSharePath(path.resolve(transfer.receivedPath), transfer.remoteName)

  if (!sharePath || !fs.existsSync(sharePath)) return null

  const shareType = transfer.transferType
  const existed = await prisma.p2p_local_share.findFirst({
    where: {
      p2pGroupId: transfer.p2pGroupId,
      shareType,
      OR: [
        { sharePath },
        ...(transfer.remoteMediaId ? [{ remoteMediaId: transfer.remoteMediaId }] : []),
        ...(transfer.remoteMangaId ? [{ remoteMangaId: transfer.remoteMangaId }] : []),
      ],
    },
    orderBy: { p2pLocalShareId: 'asc' },
  })

  if (existed) {
    return prisma.p2p_local_share.update({
      where: { p2pLocalShareId: existed.p2pLocalShareId },
      data: {
        sharePath,
        shareName: transfer.remoteName || path.basename(sharePath),
        enable: 1,
        mediaId: null,
        mangaId: null,
        remoteMediaId: transfer.remoteMediaId ?? null,
        remoteMangaId: transfer.remoteMangaId ?? null,
      },
    })
  }

  return prisma.p2p_local_share.create({
    data: {
      p2pGroupId: transfer.p2pGroupId,
      shareType,
      mediaId: null,
      mangaId: null,
      remoteMediaId: transfer.remoteMediaId ?? null,
      remoteMangaId: transfer.remoteMangaId ?? null,
      sharePath,
      shareName: transfer.remoteName || path.basename(sharePath),
      enable: 1,
    },
  })
}

export async function finalizePulledTransferToLocalShare(transferId: number) {
  // if (!ENABLE_PULL_AUTO_LOCAL_SHARE_FINALIZE) {
  //   console.log(`[p2p] auto local-share finalize disabled, skip transferId=${transferId}`)
  //   return false
  // }

  const transfer = await prisma.p2p_transfer.findUnique({
    where: { p2pTransferId: transferId },
    select: {
      p2pTransferId: true,
      p2pGroupId: true,
      groupNo: true,
      transferType: true,
      remoteMediaId: true,
      remoteMangaId: true,
      remoteName: true,
      receivedPath: true,
      status: true,
    },
  })
  if (!transfer || transfer.status !== 'success') return false

  if (transfer.transferType === 'chapter') return false

  const receivedPath = path.resolve(transfer.receivedPath)
  if (!fs.existsSync(receivedPath)) return false

  const scanPath = await resolveOrCreateScanPath({
    remoteName: transfer.remoteName,
    receivedPath,
  })

  await upsertTransferShare({
    p2pGroupId: transfer.p2pGroupId,
    groupNo: transfer.groupNo,
    transferType: transfer.transferType,
    remoteMediaId: transfer.remoteMediaId ?? null,
    remoteMangaId: transfer.remoteMangaId ?? null,
    remoteName: transfer.remoteName,
    receivedPath,
  })

  await addTask({
    taskName: `scan_path_${scanPath.pathId}`,
    command: 'taskScanPath',
    args: { pathId: scanPath.pathId },
    priority: TaskPriority.scan,
  })

  await announce_group(transfer.groupNo)
  return true
}
