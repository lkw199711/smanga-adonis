/**
 * P2P 瀵瑰鏈嶅姟鎺у埗鍣?
 *
 * 閮ㄧ讲鍦?/p2p/serve/* 璺敱,渚涚兢缁勫唴鍏朵粬鑺傜偣鎷夊彇鏈満璧勬簮淇℃伅涓庢枃浠躲€?
 *
 * 璁捐鍓嶆彁:
 *  - 鍏变韩鎺堟潈鐢?Tracker 缁熶竴绠＄悊,鏈帶鍒跺櫒涓嶅仛鏈湴鍏变韩/缇ょ粍鏍￠獙
 *  - 璋冪敤鏂硅兘杩涘叆姝ゆ帶鍒跺櫒,璇存槑宸茬粡閫氳繃 p2p_peer_auth_middleware 鐨勬彙鎵嬩笌鏃堕棿鎴虫牎楠?
 *  - 鍚庣画濡傞渶鏇寸粏绮掑害瀹夊叏,鍙湪 p2p_peer_auth_middleware 涓帴鍏?Tracker 涓嬪彂鐨?groupSecret + HMAC 绛惧悕
 */

import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import fs from 'fs'
import path from 'path'
import { image_files, is_img } from '#utils/index'
import { log_p2p_error, log_p2p_info } from '#utils/p2p_log'
import {
  mediaIdParamValidator,
  mangaIdParamValidator,
  chapterIdParamValidator,
  fileBodyValidator,
} from '#validators/p2p'

/** 鍥剧墖鎵╁睍鍚?涓?scan_manga_job 鐨勫缃皝闈㈡绱繚鎸佷竴鑷? */
const SIDE_COVER_EXTS = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP', '.gif', '.bmp']

/**
 * 鍒楀嚭\"涓庡熀鍚嶇浉鍏崇殑澶栫疆鏂囦欢\":
 *  - <baseName>.<ext>
 *  - <baseName>-<浠绘剰>.<ext>   (鍏稿瀷: cover-1.jpg銆乵angaName-fanart.jpg 绛夊悓鍚嶉€掑)
 * 鍖归厤鑼冨洿鍙湪缁欏畾鐩綍涓嬬殑鐩存帴瀛愰」(涓嶉€掑綊),鐢ㄤ簬 mangaPath/chapterPath 鐨?*鍚岀骇鐩綍*
 * 浠呭尮閰嶆枃浠?鐩綍涓嶈鍏?鐩綍绾у埆鐨?smanga-info 鐢变笂灞傚崟鐙鐞?
 */
function list_side_cover_files(
  siblingDir: string,
  baseName: string,
  collector: Array<{ absPath: string; relPath: string; size: number; mtime: number }>,
  relDirPrefix: string = ''
) {
  if (!siblingDir || !baseName) return
  if (!fs.existsSync(siblingDir)) return
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(siblingDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const ent of entries) {
    if (!ent.isFile()) continue
    const name = ent.name
    const ext = path.extname(name)
    if (!SIDE_COVER_EXTS.includes(ext)) continue
    const stem = name.slice(0, name.length - ext.length)
    // 绮剧‘鍚屽悕 鎴?鍚屽悕-xxx 鍓嶇紑(-鍚庡厑璁镐换鎰忓唴瀹?瑕嗙洊 -1/-01/-fanart 绛?
    const matched = stem === baseName || stem.startsWith(`${baseName}-`)
    if (!matched) continue
    const abs = path.join(siblingDir, name)
    let st: fs.Stats
    try {
      st = fs.statSync(abs)
    } catch {
      continue
    }
    const rel = relDirPrefix ? `${relDirPrefix}/${name}` : name
    collector.push({ absPath: abs, relPath: rel, size: st.size, mtime: st.mtimeMs })
  }
}

/**
 * 閫掑綊鎵弿涓€涓洰褰曚笅鐨勬墍鏈夋枃浠?鍚瓙鐩綍),杩斿洖鐩稿璺緞娓呭崟
 * 娉ㄦ剰:浼氳窡闅忕鍙烽摼鎺ヤ互澶栫殑鏅€氭枃浠?鐩綍;璺宠繃甯歌鐨勭郴缁熼殣钘忛」(Thumbs.db 绛?
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
      // 鏃犳潈闄愭垨璇诲彇澶辫触,璺宠繃璇ョ洰褰?
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
      return response.json({ code: 200, message: 'pong', data: { time: Date.now() } })
    } catch (e: any) {
      log_p2p_error('serve.ping', e)
      return response.status(500).json({ code: 500, message: e?.message || 'ping 澶辫触' })
    }
  }

  /**
   * GET /p2p/serve/shares
   * 宸插簾寮?鍏变韩鍒楄〃缁熶竴浠?Tracker 鑾峰彇,鑺傜偣鏈湴涓嶅啀缁存姢
   * 淇濈暀璺敱浠ュ吋瀹规棫瀹㈡埛绔?鐩存帴杩斿洖绌哄垪琛?
   */
  async shares({ response }: HttpContext) {
    return response.json({ code: 200, message: '', list: [], count: 0 })
  }

  /**
   * GET /p2p/serve/media/:mediaId/mangas
   */
  async mangas({ request, params, response }: HttpContext) {
    try {
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const { mediaId } = await mediaIdParamValidator.validate(params)

      const mangas = await prisma.manga.findMany({
        where: { mediaId },
        orderBy: { mangaName: 'asc' },
      })
      log_p2p_info('serve.mangas', { groupNo, callerNodeId, mediaId, count: mangas.length })
      return response.json({ code: 200, message: '', list: mangas, count: mangas.length })
    } catch (e: any) {
      log_p2p_error('serve.mangas', e)
      return response.status(500).json({ code: 500, message: e?.message || 'mangas 鏌ヨ澶辫触' })
    }
  }

  /**
   * GET /p2p/serve/manga/:mangaId/chapters
   */
  async chapters({ request, params, response }: HttpContext) {
    try {
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const { mangaId } = await mangaIdParamValidator.validate(params)

      const manga = await prisma.manga.findUnique({ where: { mangaId } })
      if (!manga) {
        log_p2p_info('serve.chapters.not_found', { groupNo, callerNodeId, mangaId })
        return response
          .status(404)
          .json({ code: 404, message: `manga not found (mangaId=${mangaId})`, status: 'not found' })
      }

      const chapters = await prisma.chapter.findMany({
        where: { mangaId },
        orderBy: { chapterNumber: 'asc' },
      })
      log_p2p_info('serve.chapters', { groupNo, callerNodeId, mangaId, count: chapters.length })
      return response.json({ code: 200, message: '', list: chapters, count: chapters.length })
    } catch (e: any) {
      log_p2p_error('serve.chapters', e)
      return response.status(500).json({ code: 500, message: e?.message || 'chapters 鏌ヨ澶辫触' })
    }
  }

  /**
   * GET /p2p/serve/chapter/:chapterId/images
   */
  async images({ request, params, response }: HttpContext) {
    try {
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const { chapterId } = await chapterIdParamValidator.validate(params)

      const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
      if (!chapter) {
        log_p2p_info('serve.images.not_found', { groupNo, callerNodeId, chapterId })
        return response
          .status(404)
          .json({ code: 404, message: `chapter not found (chapterId=${chapterId})`, status: 'not found' })
      }

      const images = image_files(chapter.chapterPath)
      log_p2p_info('serve.images', {
        groupNo,
        callerNodeId,
        chapterId,
        path: chapter.chapterPath,
        count: images.length,
      })
      return response.json({ code: 200, message: '', list: images, count: images.length })
    } catch (e: any) {
      log_p2p_error('serve.images', e)
      return response.status(500).json({ code: 500, message: e?.message || 'images 鏌ヨ澶辫触' })
    }
  }

  /**
   * GET /p2p/serve/manga/:mangaId/tree
   * 杩斿洖婕敾涓嬫墍鏈夋枃浠剁殑娓呭崟(鍚瓙鐩綍),瀹㈡埛绔寜 relPath 鍦ㄦ湰鍦伴噸寤虹洰褰曠粨鏋勩€?
   *
   * 鍝嶅簲:
   *   - isSingleFile=true  : mangaPath 鏈韩鏄崟涓枃浠?濡?xxx.zip),files 鍙惈瀹冭嚜韬?relPath=basename
   *   - isSingleFile=false : mangaPath 鏄洰褰?files 鏄鐩綍涓嬮€掑綊鍏ㄩ儴鏂囦欢
   *
   * 璇存槑:涓嶅湪姝ゅ仛鏂囦欢绫诲瀷杩囨护,"婕敾鏂囦欢澶瑰唴鏈変粈涔堝氨澶嶅埗浠€涔?,淇濊瘉 zip/rar/cbz/cbr/pdf/epub/鏁ｅ浘/series.json/.smanga/ 绛夊叏閮ㄨ鐩?
   */
  async tree({ request, params, response }: HttpContext) {
    try {
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const { mangaId } = await mangaIdParamValidator.validate(params)

      const manga = await prisma.manga.findUnique({ where: { mangaId } })
      if (!manga) {
        log_p2p_info('serve.tree.not_found_manga', { groupNo, callerNodeId, mangaId })
        return response
          .status(404)
          .json({ code: 404, message: `manga not found (mangaId=${mangaId})`, status: 'not found' })
      }

      const mangaPath = manga.mangaPath
      if (!fs.existsSync(mangaPath)) {
        log_p2p_info('serve.tree.not_found_path', { groupNo, callerNodeId, mangaId, mangaPath })
        return response
          .status(404)
          .json({ code: 404, message: `manga path not found: ${mangaPath}`, status: 'not found' })
      }

      const stat = fs.statSync(mangaPath)

      let rootDir: string
      let isSingleFile: boolean
      let files: Array<{ absPath: string; relPath: string; size: number; mtime: number }>
      // sideFiles: 婕敾鍚岀骇鐩綍涓嬨€佷笌鏈极鐢荤浉鍏崇殑澶栫疆鏂囦欢(澶栫疆灏侀潰銆乻manga-info 鐩綍绛?
      //   relPath 浠?\"婕敾鐖剁洰褰昞" 涓烘牴,瀹㈡埛绔寜 path.join(parentDir, relPath) 钀界洏
      const sideFiles: Array<{ absPath: string; relPath: string; size: number; mtime: number }> = []

      // 婕敾鍚?涓嶅惈鎵╁睍鍚?,渚涘缃皝闈㈠尮閰嶄笌绔犺妭澶栫疆灏侀潰鑱氬悎浣跨敤
      const mangaBaseName = stat.isFile()
        ? path.basename(mangaPath).replace(/\.(cbr|cbz|zip|7z|epub|rar|pdf)$/i, '')
        : path.basename(mangaPath)
      const mangaParentDir = path.dirname(mangaPath)

      if (stat.isFile()) {
        // 鍗曟湰婕敾:mangaPath 鏄竴涓枃浠?zip/pdf/...)
        isSingleFile = true
        rootDir = mangaParentDir
        files = [
          {
            absPath: mangaPath,
            relPath: path.basename(mangaPath),
            size: stat.size,
            mtime: stat.mtimeMs,
          },
        ]
      } else {
        // 绔犺妭婕敾:mangaPath 鏄洰褰?閫掑綊鍒楀嚭鎵€鏈夋枃浠?
        isSingleFile = false
        rootDir = mangaPath
        files = walk_dir_files(mangaPath)
      }

      // 1) 婕敾鍚岀骇澶栫疆灏侀潰: <mangaBaseName>.ext / <mangaBaseName>-*.ext
      list_side_cover_files(mangaParentDir, mangaBaseName, sideFiles)

      // 2) 婕敾鍚岀骇 smanga-info 鐩綍(<mangaBaseName>-smanga-info)
      const smangaInfoDir = path.join(mangaParentDir, `${mangaBaseName}-smanga-info`)
      if (fs.existsSync(smangaInfoDir) && fs.statSync(smangaInfoDir).isDirectory()) {
        const infoFiles = walk_dir_files(smangaInfoDir)
        for (const f of infoFiles) {
          sideFiles.push({
            absPath: f.absPath,
            relPath: `${mangaBaseName}-smanga-info/${f.relPath}`,
            size: f.size,
            mtime: f.mtime,
          })
        }
      }

      // 3) 绔犺妭鍚岀骇澶栫疆灏侀潰(浣嶄簬 mangaPath 鍐呴儴)宸茬敱 walk_dir_files 鏀跺綍鍒?files 涓?
      //    瀹㈡埛绔?MangaJob 浼氫粠 tree.files 閲岀瓫"闈炵珷鑺傚唴閮ㄦ枃浠?缁熶竴涓嬭浇,
      //    sideFiles 浠呮壙杞?mangaPath *澶栭儴* 鐨勬枃浠?婕敾鍚岀骇澶栫疆灏侀潰 / smanga-info 鐩綍)

      const totalBytes =
        files.reduce((acc, f) => acc + (f.size || 0), 0) +
        sideFiles.reduce((acc, f) => acc + (f.size || 0), 0)
      log_p2p_info('serve.tree', {
        groupNo,
        callerNodeId,
        mangaId,
        isSingleFile,
        fileCount: files.length,
        sideFileCount: sideFiles.length,
        totalBytes,
      })


      return response.json({
        code: 200,
        message: '',
        data: {
          mangaId: manga.mangaId,
          mangaName: manga.mangaName,
          mangaPath: manga.mangaPath,
          isSingleFile,
          rootDir,
          parentDir: mangaParentDir,
          fileCount: files.length,
          totalBytes,
          files,
          sideFiles,
        },
      })
    } catch (e: any) {
      log_p2p_error('serve.tree', e)
      return response.status(500).json({ code: 500, message: e?.message || 'tree 鏌ヨ澶辫触' })
    }
  }

  /**
   * GET /p2p/serve/chapter/:chapterId/tree
   * 杩斿洖绔犺妭涓嬫墍鏈夋枃浠舵竻鍗?鍚瓙鐩綍),閫昏緫鍚?manga.tree 浣嗕綔鐢ㄤ簬 chapter.chapterPath
   */
  async chapter_tree({ request, params, response }: HttpContext) {
    try {
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const { chapterId } = await chapterIdParamValidator.validate(params)

      const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
      if (!chapter) {
        log_p2p_info('serve.chapter_tree.not_found_chapter', { groupNo, callerNodeId, chapterId })
        return response
          .status(404)
          .json({ code: 404, message: `chapter not found (chapterId=${chapterId})`, status: 'not found' })
      }

      const chapterPath = chapter.chapterPath
      if (!fs.existsSync(chapterPath)) {
        log_p2p_info('serve.chapter_tree.not_found_path', {
          groupNo,
          callerNodeId,
          chapterId,
          chapterPath,
        })
        return response
          .status(404)
          .json({ code: 404, message: `chapter path not found: ${chapterPath}`, status: 'not found' })
      }

      const stat = fs.statSync(chapterPath)
      let rootDir: string
      let isSingleFile: boolean
      let files: Array<{ absPath: string; relPath: string; size: number; mtime: number }>
      // sideFiles: 绔犺妭鍚岀骇鐩綍涓嬨€佷笌鏈珷鑺傜浉鍏崇殑澶栫疆灏侀潰
      //   relPath = basename(鍚岀骇鏂囦欢),瀹㈡埛绔寜 path.join(parentDir, relPath) 钀界洏
      const sideFiles: Array<{ absPath: string; relPath: string; size: number; mtime: number }> = []

      const chParentDir = path.dirname(chapterPath)
      // 绔犺妭鍩哄悕(鐩綍淇濈暀鍏ㄥ悕,鏂囦欢鍘绘墿灞曞悕)
      let chBaseName = path.basename(chapterPath)
      const extMatch = /\.(cbr|cbz|zip|7z|epub|rar|pdf)$/i.exec(chBaseName)
      if (extMatch) chBaseName = chBaseName.slice(0, chBaseName.length - extMatch[0].length)

      if (stat.isFile()) {
        isSingleFile = true
        rootDir = chParentDir
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

      // 绔犺妭鍚岀骇澶栫疆灏侀潰: <chBaseName>.ext / <chBaseName>-*.ext
      list_side_cover_files(chParentDir, chBaseName, sideFiles)
      // 鐩綍鍨嬬珷鑺?澶栫疆灏侀潰濡傚凡浣嶄簬 chapterPath 鍐呴儴,浼氬嚭鐜板湪 files 涓?杩欓噷 chParentDir
      // 鏄?chapterPath 鐨勭埗鐩綍,涓嶄細閲嶅彔,鏃犻渶鍘婚噸

      const totalBytes =
        files.reduce((acc, f) => acc + (f.size || 0), 0) +
        sideFiles.reduce((acc, f) => acc + (f.size || 0), 0)
      log_p2p_info('serve.chapter_tree', {
        groupNo,
        callerNodeId,
        chapterId,
        isSingleFile,
        fileCount: files.length,
        sideFileCount: sideFiles.length,
        totalBytes,
      })


      return response.json({
        code: 200,
        message: '',
        data: {
          chapterId: chapter.chapterId,
          chapterName: chapter.chapterName,
          chapterPath: chapter.chapterPath,
          isSingleFile,
          rootDir,
          parentDir: chParentDir,
          fileCount: files.length,
          totalBytes,
          files,
          sideFiles,
        },
      })
    } catch (e: any) {
      log_p2p_error('serve.chapter_tree', e)
      return response.status(500).json({ code: 500, message: e?.message || 'chapter_tree 鏌ヨ澶辫触' })
    }
  }

  /**
   * POST /p2p/serve/file/stat  { file: absPath }
   * 杩斿洖鏂囦欢鍏冧俊鎭?size/mtime),渚涘鎴风鍋氬畬鏁存€ф牎楠?
   */
  async file_stat({ request, response }: HttpContext) {
    try {
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      const { file } = await fileBodyValidator.validate(request.all())

      if (!fs.existsSync(file)) {
        log_p2p_info('serve.file_stat.not_found', { groupNo, callerNodeId, file })
        return response.status(404).json({ code: 404, message: `file not found: ${file}` })
      }
      const st = fs.statSync(file)
      return response.json({ code: 200, message: '', data: { size: st.size, mtime: st.mtimeMs, isFile: st.isFile() } })
    } catch (e: any) {
      log_p2p_error('serve.file_stat', e)
      return response.status(500).json({ code: 500, message: e?.message || 'file_stat 澶辫触' })
    }
  }

  /**
   * POST/GET /p2p/serve/file  { file: absPath }
   * 鏀寔 HTTP Range:
   *  - 鏃?Range 澶?        鈫?200 OK + 鏁存枃浠?
   *  - `Range: bytes=a-b`  鈫?206 Partial Content + [a,b] 鍖洪棿
   *  - `Range: bytes=a-`   鈫?206 + [a, size-1]
   * 濮嬬粓鏆撮湶 `Accept-Ranges: bytes` 渚涘鎴风鎺㈡祴
   */
  async file({ request, response }: HttpContext) {
    try {
      const { groupNo, callerNodeId } = (request as any).p2pContext || {}
      // 鍏煎 POST body / GET query 涓ょ浼犲弬锛岀粺涓€鍚堝苟鍚庤蛋 validator
      const merged: any = { ...(request.qs?.() || {}), ...(request.all?.() || {}) }
      const { file } = await fileBodyValidator.validate(merged)

      if (!fs.existsSync(file)) {
        log_p2p_info('serve.file.not_found', { groupNo, callerNodeId, file })
        return response.status(404).json({ code: 404, message: `file not found: ${file}` })
      }

      const st = fs.statSync(file)
      const totalSize = st.size
      const rangeHeader = request.header('range') || request.header('Range')

      response.header('Content-Type', is_img(file) ? 'image/jpeg' : 'application/octet-stream')
      response.header('Accept-Ranges', 'bytes')
      response.header('X-File-Size', String(totalSize))
      response.header('X-File-Mtime', String(st.mtimeMs))

      if (rangeHeader && /^bytes=/i.test(rangeHeader)) {
        // 瑙ｆ瀽 Range: bytes=start-end
        const m = /bytes=(\d*)-(\d*)/i.exec(rangeHeader)
        let start = m && m[1] !== '' ? Number(m[1]) : NaN
        let end = m && m[2] !== '' ? Number(m[2]) : NaN

        if (isNaN(start) && !isNaN(end)) {
          // suffix: bytes=-N  鈫?鏈€鍚?N 瀛楄妭
          start = Math.max(0, totalSize - end)
          end = totalSize - 1
        } else {
          if (isNaN(start)) start = 0
          if (isNaN(end) || end >= totalSize) end = totalSize - 1
        }

        if (start < 0 || start >= totalSize || end < start) {
          response.header('Content-Range', `bytes */${totalSize}`)
          return response.status(416).json({ code: 416, message: `invalid range: ${rangeHeader}` })
        }

        const chunkSize = end - start + 1
        response.status(206)
        response.header('Content-Range', `bytes ${start}-${end}/${totalSize}`)
        response.header('Content-Length', String(chunkSize))
        response.stream(fs.createReadStream(file, { start, end }))
        return
      }

      response.header('Content-Length', String(totalSize))
      response.stream(fs.createReadStream(file))
    } catch (e: any) {
      log_p2p_error('serve.file', e)
      return response.status(500).json({ code: 500, message: e?.message || 'file 娴佸紡涓嬭浇澶辫触' })
    }
  }
}
