import type { HttpContext } from '@adonisjs/core/http'
import fs from 'fs'
import path from 'path'
import prisma from '#start/prisma'
import { log_p2p_error } from '#utils/p2p_log'
import { announce_group } from '#services/p2p/p2p_announce_service'
import {
  listP2PShareQueryValidator,
  createP2PShareValidator,
  updateP2PShareValidator,
  announceP2PShareValidator,
  idParamP2PValidator,
} from '#validators/p2p'

export default class P2PSharesController {
  async index({ request, response }: HttpContext) {
    const { groupNo, page, pageSize } = await listP2PShareQueryValidator.validate(request.qs())
    const where: any = {}

    if (groupNo) {
      const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
      if (!group) {
        return response.json({ code: 200, message: '', list: [], count: 0 })
      }
      where.p2pGroupId = group.p2pGroupId
    }

    const queryParams: any = {
      where,
      orderBy: { createTime: 'desc' },
      include: {
        group: {
          select: { p2pGroupId: true, groupNo: true, groupName: true },
        },
      },
    }
    if (page && pageSize) {
      queryParams.skip = (Number(page) - 1) * Number(pageSize)
      queryParams.take = Number(pageSize)
    }

    const list: any[] = await prisma.p2p_local_share.findMany(queryParams)
    const count = await prisma.p2p_local_share.count({ where })

    const mediaIds = Array.from(new Set(list.map((s) => s.mediaId).filter((v): v is number => !!v)))
    const mangaIds = Array.from(new Set(list.map((s) => s.mangaId).filter((v): v is number => !!v)))

    const [mediaRowsRaw, mangaRowsRaw] = await Promise.all([
      mediaIds.length
        ? prisma.media.findMany({
            where: { mediaId: { in: mediaIds } },
            select: { mediaId: true, mediaName: true },
          })
        : Promise.resolve([] as { mediaId: number; mediaName: string }[]),
      mangaIds.length
        ? prisma.manga.findMany({
            where: { mangaId: { in: mangaIds } },
            select: { mangaId: true, mangaName: true, mediaId: true },
          })
        : Promise.resolve([] as { mangaId: number; mangaName: string; mediaId: number }[]),
    ])
    const mediaRows = mediaRowsRaw as { mediaId: number; mediaName: string }[]
    const mangaRows = mangaRowsRaw as { mangaId: number; mangaName: string; mediaId: number }[]

    const mediaMap = new Map<number, string>(
      mediaRows.map((item: { mediaId: number; mediaName: string }) => [item.mediaId, item.mediaName])
    )
    const mangaMap = new Map<number, { mangaId: number; mangaName: string; mediaId: number }>(
      mangaRows.map((item: { mangaId: number; mangaName: string; mediaId: number }) => [item.mangaId, item])
    )

    const enriched = list.map((share: any) => {
      const groupName = share.group?.groupName || ''
      const groupNoVal = share.group?.groupNo || ''

      let mediaName = ''
      let mangaName = ''
      if (share.mediaId && mediaMap.has(share.mediaId)) {
        mediaName = mediaMap.get(share.mediaId) || ''
      }
      if (share.mangaId && mangaMap.has(share.mangaId)) {
        const manga = mangaMap.get(share.mangaId)!
        mangaName = manga.mangaName
        if (!mediaName && manga.mediaId && mediaMap.has(manga.mediaId)) {
          mediaName = mediaMap.get(manga.mediaId) || ''
        }
      }

      return {
        ...share,
        groupName,
        groupNo: groupNoVal,
        mediaName,
        mangaName,
        resolvedPath: share.sharePath || '',
      }
    })

    return response.json({ code: 200, message: '', list: enriched, count })
  }

  async create({ request, response }: HttpContext) {
    const {
      groupNo,
      shareType,
      mediaId,
      mangaId,
      remoteMediaId,
      remoteMangaId,
      sharePath,
      shareName,
    } = await createP2PShareValidator.validate(request.all())

    const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
    if (!group) {
      return response.status(400).json({ code: 400, message: 'group not found' })
    }

    if (shareType !== 'media' && shareType !== 'manga') {
      return response.status(400).json({ code: 400, message: 'shareType must be media or manga' })
    }

    const normalizedSharePath = sharePath ? path.resolve(String(sharePath)) : null
    if (normalizedSharePath && !fs.existsSync(normalizedSharePath)) {
      return response.status(400).json({ code: 400, message: 'sharePath not found' })
    }

    if (shareType === 'media' && !mediaId && !normalizedSharePath) {
      return response.status(400).json({ code: 400, message: 'mediaId or sharePath required' })
    }
    if (shareType === 'manga' && !mangaId && !normalizedSharePath) {
      return response.status(400).json({ code: 400, message: 'mangaId or sharePath required' })
    }

    let resolvedShareName = shareName ? String(shareName).trim() : ''
    try {
      if (!resolvedShareName) {
        if (shareType === 'media' && mediaId) {
          const media = await prisma.media.findUnique({ where: { mediaId: Number(mediaId) } })
          resolvedShareName = media?.mediaName || `media-${mediaId}`
        } else if (shareType === 'manga' && mangaId) {
          const manga = await prisma.manga.findUnique({ where: { mangaId: Number(mangaId) } })
          resolvedShareName = manga?.mangaName || `manga-${mangaId}`
        } else if (normalizedSharePath) {
          resolvedShareName = path.basename(normalizedSharePath)
        }
      }
    } catch (error: any) {
      log_p2p_error('share.create.resolveName', error)
      resolvedShareName =
        normalizedSharePath
          ? path.basename(normalizedSharePath)
          : shareType === 'media'
            ? `media-${mediaId}`
            : `manga-${mangaId}`
    }

    try {
      const existed = await prisma.p2p_local_share.findFirst({
        where: {
          p2pGroupId: group.p2pGroupId,
          shareType,
          OR: [
            ...(normalizedSharePath ? [{ sharePath: normalizedSharePath }] : []),
            ...(remoteMediaId ? [{ remoteMediaId: Number(remoteMediaId) }] : []),
            ...(remoteMangaId ? [{ remoteMangaId: Number(remoteMangaId) }] : []),
            ...(mediaId ? [{ mediaId: Number(mediaId) }] : []),
            ...(mangaId ? [{ mangaId: Number(mangaId) }] : []),
          ],
        },
      })
      if (existed) {
        return response.status(400).json({ code: 400, message: 'share already exists', data: existed })
      }

      const item = await prisma.p2p_local_share.create({
        data: {
          p2pGroupId: group.p2pGroupId,
          shareType,
          mediaId: mediaId ? Number(mediaId) : null,
          mangaId: mangaId ? Number(mangaId) : null,
          remoteMediaId: remoteMediaId ? Number(remoteMediaId) : null,
          remoteMangaId: remoteMangaId ? Number(remoteMangaId) : null,
          sharePath: normalizedSharePath,
          shareName: resolvedShareName,
          enable: 1,
        },
      })

      announce_group(group.groupNo)
      return response.json({ code: 200, message: 'create success', data: item })
    } catch (error: any) {
      log_p2p_error('share.create', error)
      return response.status(500).json({ code: 500, message: error?.message || 'create failed' })
    }
  }

  async update({ params, request, response }: HttpContext) {
    const { id } = await idParamP2PValidator.validate(params)
    const {
      enable,
      shareName,
      mediaId,
      mangaId,
      remoteMediaId,
      remoteMangaId,
      sharePath,
    } = await updateP2PShareValidator.validate(request.all())

    const existed = await prisma.p2p_local_share.findUnique({ where: { p2pLocalShareId: id } })
    if (!existed) {
      return response.status(404).json({ code: 404, message: 'not found' })
    }

    try {
      const normalizedSharePath = sharePath ? path.resolve(String(sharePath)) : undefined
      if (normalizedSharePath && !fs.existsSync(normalizedSharePath)) {
        return response.status(400).json({ code: 400, message: 'sharePath not found' })
      }

      const item = await prisma.p2p_local_share.update({
        where: { p2pLocalShareId: id },
        data: {
          ...(enable !== undefined && { enable }),
          ...(shareName !== undefined && { shareName }),
          ...(mediaId !== undefined && { mediaId: mediaId ? Number(mediaId) : null }),
          ...(mangaId !== undefined && { mangaId: mangaId ? Number(mangaId) : null }),
          ...(remoteMediaId !== undefined && { remoteMediaId: remoteMediaId ? Number(remoteMediaId) : null }),
          ...(remoteMangaId !== undefined && { remoteMangaId: remoteMangaId ? Number(remoteMangaId) : null }),
          ...(sharePath !== undefined && { sharePath: normalizedSharePath || null }),
        },
      })

      const group = await prisma.p2p_group.findUnique({ where: { p2pGroupId: existed.p2pGroupId } })
      if (group) announce_group(group.groupNo)

      return response.json({ code: 200, message: 'update success', data: item })
    } catch (error: any) {
      log_p2p_error('share.update', error)
      return response.status(500).json({ code: 500, message: error?.message || 'update failed' })
    }
  }

  async destroy({ params, response }: HttpContext) {
    const { id } = await idParamP2PValidator.validate(params)
    const existed = await prisma.p2p_local_share.findUnique({ where: { p2pLocalShareId: id } })
    if (!existed) {
      return response.status(404).json({ code: 404, message: 'not found' })
    }

    try {
      await prisma.p2p_local_share_manifest.deleteMany({ where: { p2pLocalShareId: id } })
      await prisma.p2p_local_share.delete({ where: { p2pLocalShareId: id } })

      const group = await prisma.p2p_group.findUnique({ where: { p2pGroupId: existed.p2pGroupId } })
      if (group) announce_group(group.groupNo)

      return response.json({ code: 200, message: 'delete success' })
    } catch (error: any) {
      log_p2p_error('share.destroy', error)
      return response.status(500).json({ code: 500, message: error?.message || 'delete failed' })
    }
  }

  async announce({ request, response }: HttpContext) {
    const { groupNo } = await announceP2PShareValidator.validate(request.all())
    await announce_group(groupNo)
    return response.json({ code: 200, message: 'announce queued' })
  }
}
