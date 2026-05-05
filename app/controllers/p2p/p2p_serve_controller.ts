/**
 * P2P 对外服务控制器
 *
 * 部署在 /p2p/serve/* 路由,供群组内其他节点拉取"本机已标记为共享"的资源信息与文件。
 * (与用户侧 /p2p/group|share|peer|transfer 通过子前缀互斥, 走独立的 p2p_peer_auth_middleware 鉴权)
 *
 * 安全前提:
 *  - 经 p2p_peer_auth_middleware 校验,已确认对方在同一本地 enable 群组内
 *  - 所有查询自动限制 shareType 在 p2p_local_share.enable=1 集合内,防止越权访问非共享库
 */

import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import fs from 'fs'
import path from 'path'
import { ListResponse, SResponse } from '#interfaces/response'
import { image_files, is_img } from '#utils/index'
import { log_p2p_error } from '#utils/p2p_log'

/**
 * 根据 groupNo 找到本地 p2p_group 的主键,找不到返回 null
 */
async function find_local_group_id(groupNo: string): Promise<number | null> {
  const g = await prisma.p2p_group.findFirst({ where: { groupNo } })
  return g ? g.p2pGroupId : null
}

export default class P2PServeController {
  /**
   * GET /p2p/serve/ping
   */
  async ping({ response }: HttpContext) {
    try {
      return response.json(new SResponse({ code: 0, message: 'pong', data: { time: Date.now() } }))
    } catch (e: any) {
      log_p2p_error('serve.ping', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || 'ping 失败' }))
    }
  }

  /**
   * GET /p2p/serve/shares
   * 列出本节点在当前调用群组内共享的资源清单
   */
  async shares({ request, response }: HttpContext) {
    try {
      const { groupNo } = (request as any).p2pContext || {}
      const gid = await find_local_group_id(groupNo)
      if (gid === null) {
        return response.json(new ListResponse({ code: 0, message: '', list: [], count: 0 }))
      }
      const shares = await prisma.p2p_local_share.findMany({
        where: { p2pGroupId: gid, enable: 1 },
      })
      return response.json(
        new ListResponse({ code: 0, message: '', list: shares, count: shares.length })
      )
    } catch (e: any) {
      log_p2p_error('serve.shares', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || 'shares 查询失败' }))
    }
  }

  /**
   * GET /p2p/serve/media/:mediaId/mangas
   */
  async mangas({ request, params, response }: HttpContext) {
    try {
      const { groupNo } = (request as any).p2pContext || {}
      const mediaId = Number(params.mediaId)
      const gid = await find_local_group_id(groupNo)
      if (gid === null) {
        return response.status(403).json(new SResponse({ code: 1, message: 'group not found', status: 'forbidden' }))
      }

      const share = await prisma.p2p_local_share.findFirst({
        where: { p2pGroupId: gid, enable: 1, shareType: 'media', mediaId },
      })
      if (!share) {
        return response
          .status(403)
          .json(new SResponse({ code: 1, message: '该媒体库未对本群组共享', status: 'forbidden' }))
      }

      const mangas = await prisma.manga.findMany({
        where: { mediaId },
        orderBy: { mangaName: 'asc' },
      })
      return response.json(
        new ListResponse({ code: 0, message: '', list: mangas, count: mangas.length })
      )
    } catch (e: any) {
      log_p2p_error('serve.mangas', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || 'mangas 查询失败' }))
    }
  }

  /**
   * GET /p2p/serve/manga/:mangaId/chapters
   */
  async chapters({ request, params, response }: HttpContext) {
    try {
      const { groupNo } = (request as any).p2pContext || {}
      const mangaId = Number(params.mangaId)
      const gid = await find_local_group_id(groupNo)
      if (gid === null) {
        return response.status(403).json(new SResponse({ code: 1, message: 'group not found', status: 'forbidden' }))
      }

      const manga = await prisma.manga.findUnique({ where: { mangaId } })
      if (!manga) {
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: 'manga not found', status: 'not found' }))
      }

      const allowed = await prisma.p2p_local_share.findFirst({
        where: {
          p2pGroupId: gid,
          enable: 1,
          OR: [
            { shareType: 'media', mediaId: manga.mediaId },
            { shareType: 'manga', mangaId: mangaId },
          ],
        },
      })
      if (!allowed) {
        return response
          .status(403)
          .json(new SResponse({ code: 1, message: '该漫画未对本群组共享', status: 'forbidden' }))
      }

      const chapters = await prisma.chapter.findMany({
        where: { mangaId },
        orderBy: { chapterNumber: 'asc' },
      })
      return response.json(
        new ListResponse({ code: 0, message: '', list: chapters, count: chapters.length })
      )
    } catch (e: any) {
      log_p2p_error('serve.chapters', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || 'chapters 查询失败' }))
    }
  }

  /**
   * GET /p2p/serve/chapter/:chapterId/images
   */
  async images({ request, params, response }: HttpContext) {
    try {
      const { groupNo } = (request as any).p2pContext || {}
      const chapterId = Number(params.chapterId)
      const gid = await find_local_group_id(groupNo)
      if (gid === null) {
        return response.status(403).json(new SResponse({ code: 1, message: 'group not found', status: 'forbidden' }))
      }

      const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
      if (!chapter) {
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: 'chapter not found', status: 'not found' }))
      }

      const manga = await prisma.manga.findUnique({ where: { mangaId: chapter.mangaId } })
      if (!manga) {
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: 'manga not found', status: 'not found' }))
      }
      const allowed = await prisma.p2p_local_share.findFirst({
        where: {
          p2pGroupId: gid,
          enable: 1,
          OR: [
            { shareType: 'media', mediaId: manga.mediaId },
            { shareType: 'manga', mangaId: manga.mangaId },
          ],
        },
      })
      if (!allowed) {
        return response
          .status(403)
          .json(new SResponse({ code: 1, message: '无权访问', status: 'forbidden' }))
      }

      const images = image_files(chapter.chapterPath)
      return response.json(
        new ListResponse({ code: 0, message: '', list: images, count: images.length })
      )
    } catch (e: any) {
      log_p2p_error('serve.images', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || 'images 查询失败' }))
    }
  }

  /**
   * POST /p2p/serve/file  { file: absPath }
   */
  async file({ request, response }: HttpContext) {
    try {
      const { groupNo } = (request as any).p2pContext || {}
      const { file } = request.only(['file'])
      const gid = await find_local_group_id(groupNo)
      if (gid === null) {
        return response.status(403).json({ code: 1, message: 'group not found' })
      }

      if (!file || typeof file !== 'string') {
        return response.status(400).json({ code: 1, message: 'file param required' })
      }
      if (!fs.existsSync(file)) {
        return response.status(404).json({ code: 1, message: 'file not found' })
      }

      const shares = await prisma.p2p_local_share.findMany({
        where: { p2pGroupId: gid, enable: 1 },
      })
      if (!shares.length) {
        return response.status(403).json({ code: 1, message: '无共享范围' })
      }

      const mediaIds = shares.filter((s) => s.shareType === 'media').map((s) => s.mediaId!).filter(Boolean)
      const mangaIds = shares.filter((s) => s.shareType === 'manga').map((s) => s.mangaId!).filter(Boolean)

      const allowedPaths: string[] = []
      if (mediaIds.length) {
        const paths = await prisma.path.findMany({ where: { mediaId: { in: mediaIds } } })
        paths.forEach((p) => allowedPaths.push(p.pathContent))
      }
      if (mangaIds.length) {
        const mangas = await prisma.manga.findMany({ where: { mangaId: { in: mangaIds } } })
        mangas.forEach((m) => allowedPaths.push(m.mangaPath))
      }

      const normTarget = path.resolve(file)
      const isAllowed = allowedPaths.some((p) => normTarget.startsWith(path.resolve(p)))
      if (!isAllowed) {
        return response.status(403).json({ code: 1, message: '文件不在共享范围内' })
      }

      response.header('Content-Type', is_img(file) ? 'image/jpeg' : 'application/octet-stream')
      response.stream(fs.createReadStream(file))
    } catch (e: any) {
      log_p2p_error('serve.file', e)
      return response.status(500).json({ code: 1, message: e?.message || 'file 流式下载失败' })
    }
  }
}