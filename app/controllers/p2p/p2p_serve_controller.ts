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
import path from 'path'
import { ListResponse, SResponse } from '#interfaces/response'
import { image_files, is_img } from '#utils/index'
import { log_p2p_error } from '#utils/p2p_log'

/**
 * 递归扫描一个目录下的所有文件(含子目录),返回相对路径清单
 * 注意:会跟随符号链接以外的普通文件/目录;跳过常见的系统隐藏项(Thumbs.db 等)
 */
function walk_dir_files(
  rootDir: string,
  opts: { maxFiles?: number; skipNames?: Set<string> } = {}
): Array<{ absPath: string; relPath: string; size: number; mtime: number }> {
  const maxFiles = opts.maxFiles ?? 200000
  const skipNames = opts.skipNames ?? new Set(['Thumbs.db', '.DS_Store', 'desktop.ini'])

  const result: Array<{ absPath: string; relPath: string; size: number; mtime: number }> = []
  const stack: string[] = [rootDir]

  while (stack.length) {
    const cur = stack.pop() as string
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch (e) {
      // 无权限或读取失败,跳过该目录
      continue
    }

    for (const ent of entries) {
      if (skipNames.has(ent.name)) continue
      const abs = path.join(cur, ent.name)
      if (ent.isDirectory()) {
        stack.push(abs)
      } else if (ent.isFile()) {
        let st: fs.Stats
        try {
          st = fs.statSync(abs)
        } catch {
          continue
        }
        const rel = path.relative(rootDir, abs).split(path.sep).join('/')
        result.push({
          absPath: abs,
          relPath: rel,
          size: st.size,
          mtime: st.mtimeMs,
        })
        if (result.length >= maxFiles) return result
      }
    }
  }
  return result
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
   * GET /p2p/serve/manga/:mangaId/tree
   * 返回漫画下所有文件的清单(含子目录),客户端按 relPath 在本地重建目录结构。
   *
   * 响应:
   *   - isSingleFile=true  : mangaPath 本身是单个文件(如 xxx.zip),files 只含它自身,relPath=basename
   *   - isSingleFile=false : mangaPath 是目录,files 是该目录下递归全部文件
   *
   * 说明:不在此做文件类型过滤,"漫画文件夹内有什么就复制什么",保证 zip/rar/cbz/cbr/pdf/epub/散图/series.json/.smanga/ 等全部覆盖
   */
  async tree({ request, params, response }: HttpContext) {
    try {
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const mangaId = Number(params.mangaId)

      const manga = await prisma.manga.findUnique({ where: { mangaId } })
      if (!manga) {
        console.warn(`[p2p-serve] tree 404 漫画不存在 | caller=${callerNodeId} groupNo=${groupNo} mangaId=${mangaId}`)
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: `manga not found (mangaId=${mangaId})`, status: 'not found' }))
      }

      const mangaPath = manga.mangaPath
      if (!fs.existsSync(mangaPath)) {
        console.warn(`[p2p-serve] tree 404 漫画路径不存在 | mangaId=${mangaId} path=${mangaPath}`)
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: `manga path not found: ${mangaPath}`, status: 'not found' }))
      }

      const stat = fs.statSync(mangaPath)

      let rootDir: string
      let isSingleFile: boolean
      let files: Array<{ absPath: string; relPath: string; size: number; mtime: number }>

      if (stat.isFile()) {
        // 单本漫画:mangaPath 是一个文件(zip/pdf/...)
        isSingleFile = true
        rootDir = path.dirname(mangaPath)
        files = [
          {
            absPath: mangaPath,
            relPath: path.basename(mangaPath),
            size: stat.size,
            mtime: stat.mtimeMs,
          },
        ]
      } else {
        // 章节漫画:mangaPath 是目录,递归列出所有文件
        isSingleFile = false
        rootDir = mangaPath
        files = walk_dir_files(mangaPath)
      }

      const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0)

      console.log(
        `[p2p-serve] tree 200 | caller=${callerNodeId} groupNo=${groupNo} ` +
        `mangaId=${mangaId} isSingleFile=${isSingleFile} fileCount=${files.length} totalBytes=${totalBytes}`
      )

      return response.json(
        new SResponse({
          code: 0,
          message: '',
          data: {
            mangaId: manga.mangaId,
            mangaName: manga.mangaName,
            mangaPath: manga.mangaPath,
            isSingleFile,
            rootDir,
            fileCount: files.length,
            totalBytes,
            files,
          },
        })
      )
    } catch (e: any) {
      log_p2p_error('serve.tree', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || 'tree 查询失败' }))
    }
  }

  /**
   * GET /p2p/serve/chapter/:chapterId/tree
   * 返回章节下所有文件清单(含子目录),逻辑同 manga.tree 但作用于 chapter.chapterPath
   */
  async chapter_tree({ request, params, response }: HttpContext) {
    try {
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const chapterId = Number(params.chapterId)

      const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
      if (!chapter) {
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: `chapter not found (chapterId=${chapterId})`, status: 'not found' }))
      }

      const chapterPath = chapter.chapterPath
      if (!fs.existsSync(chapterPath)) {
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: `chapter path not found: ${chapterPath}`, status: 'not found' }))
      }

      const stat = fs.statSync(chapterPath)
      let rootDir: string
      let isSingleFile: boolean
      let files: Array<{ absPath: string; relPath: string; size: number; mtime: number }>

      if (stat.isFile()) {
        isSingleFile = true
        rootDir = path.dirname(chapterPath)
        files = [
          {
            absPath: chapterPath,
            relPath: path.basename(chapterPath),
            size: stat.size,
            mtime: stat.mtimeMs,
          },
        ]
      } else {
        isSingleFile = false
        rootDir = chapterPath
        files = walk_dir_files(chapterPath)
      }

      const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0)

      console.log(
        `[p2p-serve] chapter_tree 200 | caller=${callerNodeId} groupNo=${groupNo} ` +
        `chapterId=${chapterId} isSingleFile=${isSingleFile} fileCount=${files.length} totalBytes=${totalBytes}`
      )

      return response.json(
        new SResponse({
          code: 0,
          message: '',
          data: {
            chapterId: chapter.chapterId,
            chapterName: chapter.chapterName,
            chapterPath: chapter.chapterPath,
            isSingleFile,
            rootDir,
            fileCount: files.length,
            totalBytes,
            files,
          },
        })
      )
    } catch (e: any) {
      log_p2p_error('serve.chapter_tree', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || 'chapter_tree 查询失败' }))
    }
  }

  /**
   * POST /p2p/serve/file/stat  { file: absPath }
   * 返回文件元信息(size/mtime),供客户端做完整性校验
   */
  async file_stat({ request, response }: HttpContext) {
    try {
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const { file } = request.only(['file'])

      if (!file || typeof file !== 'string') {
        return response.status(400).json(new SResponse({ code: 1, message: 'file param required' }))
      }
      if (!fs.existsSync(file)) {
        console.warn(`[p2p-serve] file_stat 404 | caller=${callerNodeId} groupNo=${groupNo} file=${file}`)
        return response.status(404).json(new SResponse({ code: 1, message: `file not found: ${file}` }))
      }
      const st = fs.statSync(file)
      return response.json(
        new SResponse({
          code: 0,
          message: '',
          data: { size: st.size, mtime: st.mtimeMs, isFile: st.isFile() },
        })
      )
    } catch (e: any) {
      log_p2p_error('serve.file_stat', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || 'file_stat 失败' }))
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
      const st = fs.statSync(file)
      response.header('Content-Type', is_img(file) ? 'image/jpeg' : 'application/octet-stream')
      response.header('Content-Length', String(st.size))
      response.header('X-File-Size', String(st.size))
      response.header('X-File-Mtime', String(st.mtimeMs))
      response.stream(fs.createReadStream(file))
    } catch (e: any) {
      log_p2p_error('serve.file', e)
      return response.status(500).json({ code: 1, message: e?.message || 'file 流式下载失败' })
    }
  }
}