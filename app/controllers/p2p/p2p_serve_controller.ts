/**
 * P2P 对外服务控制器
 *
 * 部署在 /p2p/serve/* 路由,供群组内其他节点拉取本机资源信息与文件。
 *
 * 设计前提:
 *  - 共享授权由 Tracker 统一管理,本控制器不做本地共享/群组校验
 *  - 调用方能进入此控制器,说明已经通过 p2p_peer_auth_middleware 的握手与时间戳校验
 *  - 后续如需更细粒度安全,可在 p2p_peer_auth_middleware 中接入 Tracker 下发的 groupSecret + HMAC 签名
 */

import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import fs from 'fs'
import { ListResponse, SResponse } from '#interfaces/response'
import { image_files, is_img } from '#utils/index'
import { log_p2p_error } from '#utils/p2p_log'

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
   * 已废弃:共享列表统一从 Tracker 获取,节点本地不再维护
   * 保留路由以兼容旧客户端,直接返回空列表
   */
  async shares({ response }: HttpContext) {
    return response.json(new ListResponse({ code: 0, message: '', list: [], count: 0 }))
  }

  /**
   * GET /p2p/serve/media/:mediaId/mangas
   */
  async mangas({ request, params, response }: HttpContext) {
    try {
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const mediaId = Number(params.mediaId)

      const mangas = await prisma.manga.findMany({
        where: { mediaId },
        orderBy: { mangaName: 'asc' },
      })
      console.log(
        `[p2p-serve] mangas 200 | caller=${callerNodeId} groupNo=${groupNo} mediaId=${mediaId} count=${mangas.length}`
      )
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
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const mangaId = Number(params.mangaId)

      const manga = await prisma.manga.findUnique({ where: { mangaId } })
      if (!manga) {
        console.warn(`[p2p-serve] chapters 404 漫画不存在 | caller=${callerNodeId} groupNo=${groupNo} mangaId=${mangaId}`)
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: `manga not found (mangaId=${mangaId})`, status: 'not found' }))
      }

      const chapters = await prisma.chapter.findMany({
        where: { mangaId },
        orderBy: { chapterNumber: 'asc' },
      })
      console.log(
        `[p2p-serve] chapters 200 | caller=${callerNodeId} groupNo=${groupNo} mangaId=${mangaId} count=${chapters.length}`
      )
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
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const chapterId = Number(params.chapterId)

      const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
      if (!chapter) {
        console.warn(`[p2p-serve] images 404 章节不存在 | caller=${callerNodeId} groupNo=${groupNo} chapterId=${chapterId}`)
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: `chapter not found (chapterId=${chapterId})`, status: 'not found' }))
      }

      const images = image_files(chapter.chapterPath)
      console.log(
        `[p2p-serve] images 200 | caller=${callerNodeId} groupNo=${groupNo} ` +
        `chapterId=${chapterId} path=${chapter.chapterPath} count=${images.length}`
      )
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
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const { file } = request.only(['file'])

      if (!file || typeof file !== 'string') {
        console.warn(`[p2p-serve] file 400 file参数缺失 | caller=${callerNodeId} groupNo=${groupNo}`)
        return response.status(400).json({ code: 1, message: 'file param required' })
      }
      if (!fs.existsSync(file)) {
        console.warn(`[p2p-serve] file 404 文件不存在 | caller=${callerNodeId} groupNo=${groupNo} file=${file}`)
        return response.status(404).json({ code: 1, message: `file not found: ${file}` })
      }

      console.log(`[p2p-serve] file 200 | caller=${callerNodeId} groupNo=${groupNo} file=${file}`)
      response.header('Content-Type', is_img(file) ? 'image/jpeg' : 'application/octet-stream')
      response.stream(fs.createReadStream(file))
    } catch (e: any) {
      log_p2p_error('serve.file', e)
      return response.status(500).json({ code: 1, message: e?.message || 'file 流式下载失败' })
    }
  }
}