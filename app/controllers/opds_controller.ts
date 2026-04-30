/*
 * OPDS 1.2 Controller (方案 A: 最小可用)
 *
 * 路由结构 (全部 GET):
 *   /opds                          根 catalog (导航 feed)
 *   /opds/libraries                媒体库列表 (导航 feed)
 *   /opds/libraries/:mediaId       某媒体库下漫画列表 (acquisition feed, 分页)
 *   /opds/manga/:mangaId           某漫画下章节列表 (acquisition feed, 分页)
 *   /opds/chapter/:chapterId       章节详情 entry (acquisition entry)
 *   /opds/chapter/:chapterId/download  章节文件下载
 *   /opds/manga/:mangaId/cover     漫画封面
 *   /opds/chapter/:chapterId/cover 章节封面
 */

import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import * as fs from 'fs'
import * as path from 'path'
import {
  OPDS_NAV_TYPE,
  OPDS_ACQ_TYPE,
  OPDS_ENTRY_TYPE,
  OpdsEntry,
  OpdsFeed,
  OpdsLink,
  chapter_mime,
  image_mime,
  opds_base_url,
  opds_url,
  render_feed,
  render_entry,
  xml_escape,
} from '#utils/opds'
import { is_img } from '#utils/index'

// ----------------------------------------------------------------------------
// 工具函数
// ----------------------------------------------------------------------------

function page_size(): number {
  const n = Number(process.env.OPDS_PAGE_SIZE)
  return Number.isFinite(n) && n > 0 ? n : 30
}

/** 统一发送 Atom XML 响应 */
function send_xml(response: any, xml: string, type: string = OPDS_NAV_TYPE) {
  response.header('Content-Type', `${type}; charset=utf-8`)
  response.header('Cache-Control', 'no-cache')
  return response.send(xml)
}

/** 发送独立 entry XML (单条 entry 页面) */
function send_entry_xml(response: any, entry: OpdsEntry) {
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n'
  const root =
    '<entry xmlns="http://www.w3.org/2005/Atom"' +
    ' xmlns:opds="http://opds-spec.org/2010/catalog"' +
    ' xmlns:dc="http://purl.org/dc/terms/">\n'
  const body = render_entry(entry).replace(/^<entry>\n/, '').replace(/\n<\/entry>$/, '')
  const xml = head + root + body + '\n</entry>'
  return send_xml(response, xml, OPDS_ENTRY_TYPE)
}

/** 用户对媒体库的访问过滤条件 */
function media_where_for_user(user: any) {
  const isAdmin = user.role === 'admin' || user.mediaPermit === 'all'
  if (isAdmin) return {}
  const ids = (user.mediaPermissons || []).map((p: any) => p.mediaId)
  return { mediaId: { in: ids } }
}

function user_can_access_media(user: any, mediaId: number): boolean {
  const isAdmin = user.role === 'admin' || user.mediaPermit === 'all'
  if (isAdmin) return true
  const ids = (user.mediaPermissons || []).map((p: any) => p.mediaId)
  return ids.includes(mediaId)
}

// ----------------------------------------------------------------------------
// Controller
// ----------------------------------------------------------------------------

export default class OpdsController {
  /** 根 catalog: 提供进入媒体库列表的入口 */
  public async root({ request, response }: HttpContext) {
    const base = opds_base_url(request)

    const feed: OpdsFeed = {
      id: opds_url(base, '/opds'),
      title: 'smanga',
      subtitle: 'OPDS catalog',
      kind: 'navigation',
      updated: new Date(),
      links: [
        { rel: 'self', href: opds_url(base, '/opds'), type: OPDS_NAV_TYPE },
        { rel: 'start', href: opds_url(base, '/opds'), type: OPDS_NAV_TYPE },
      ],
      entries: [
        {
          id: opds_url(base, '/opds/libraries'),
          title: '媒体库',
          updated: new Date(),
          summary: '浏览全部媒体库',
          links: [
            {
              rel: 'subsection',
              href: opds_url(base, '/opds/libraries'),
              type: OPDS_NAV_TYPE,
            },
          ],
        },
      ],
    }

    return send_xml(response, render_feed(feed), OPDS_NAV_TYPE)
  }

  /** 媒体库列表 */
  public async libraries({ request, response }: HttpContext) {
    const base = opds_base_url(request)
    const user = (request as any).user

    const where = { deleteFlag: 0, ...media_where_for_user(user) }
    const list = await prisma.media.findMany({ where })

    const entries: OpdsEntry[] = list.map((m: any) => ({
      id: opds_url(base, `/opds/libraries/${m.mediaId}`),
      title: m.mediaName,
      updated: m.updateTime || new Date(),
      summary: `${m.mediaType || ''} ${m.sourceWebsite || ''}`.trim() || undefined,
      links: [
        {
          rel: 'subsection',
          href: opds_url(base, `/opds/libraries/${m.mediaId}`),
          type: OPDS_ACQ_TYPE,
        },
      ],
    }))

    const feed: OpdsFeed = {
      id: opds_url(base, '/opds/libraries'),
      title: '媒体库',
      kind: 'navigation',
      updated: new Date(),
      links: [
        { rel: 'self', href: opds_url(base, '/opds/libraries'), type: OPDS_NAV_TYPE },
        { rel: 'start', href: opds_url(base, '/opds'), type: OPDS_NAV_TYPE },
        { rel: 'up', href: opds_url(base, '/opds'), type: OPDS_NAV_TYPE },
      ],
      entries,
    }

    return send_xml(response, render_feed(feed), OPDS_NAV_TYPE)
  }

  /** 某媒体库下的漫画列表 (分页) */
  public async library_mangas({ request, response, params }: HttpContext) {
    const base = opds_base_url(request)
    const user = (request as any).user
    const mediaId = Number(params.mediaId)
    if (!Number.isFinite(mediaId)) return response.status(400).send('invalid mediaId')

    if (!user_can_access_media(user, mediaId)) {
      return response.status(403).send('Forbidden')
    }

    const media = await prisma.media.findUnique({ where: { mediaId } })
    if (!media) return response.status(404).send('media not found')

    const ps = page_size()
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const skip = (page - 1) * ps

    const where = { mediaId, deleteFlag: 0 }
    const [list, count] = await Promise.all([
      prisma.manga.findMany({
        where,
        skip,
        take: ps,
        orderBy: { mangaName: 'asc' },
      }),
      prisma.manga.count({ where }),
    ])

    const entries: OpdsEntry[] = list.map((m: any) => {
      const links: OpdsLink[] = [
        {
          rel: 'subsection',
          href: opds_url(base, `/opds/manga/${m.mangaId}`),
          type: OPDS_ACQ_TYPE,
        },
      ]
      if (m.mangaCover) {
        links.push({
          rel: 'http://opds-spec.org/image',
          href: opds_url(base, `/opds/manga/${m.mangaId}/cover`),
          type: image_mime(m.mangaCover),
        })
        links.push({
          rel: 'http://opds-spec.org/image/thumbnail',
          href: opds_url(base, `/opds/manga/${m.mangaId}/cover`),
          type: image_mime(m.mangaCover),
        })
      }
      return {
        id: opds_url(base, `/opds/manga/${m.mangaId}`),
        title: m.title || m.mangaName,
        updated: m.updateTime || m.createTime || new Date(),
        authors: m.author ? [{ name: m.author }] : undefined,
        summary: m.describe || undefined,
        issued: m.publishDate ? new Date(m.publishDate).toISOString().slice(0, 10) : undefined,
        links,
      }
    })

    const totalPages = Math.max(1, Math.ceil(count / ps))
    const feedLinks: OpdsLink[] = [
      {
        rel: 'self',
        href: opds_url(base, `/opds/libraries/${mediaId}?page=${page}`),
        type: OPDS_ACQ_TYPE,
      },
      { rel: 'start', href: opds_url(base, '/opds'), type: OPDS_NAV_TYPE },
      { rel: 'up', href: opds_url(base, '/opds/libraries'), type: OPDS_NAV_TYPE },
      {
        rel: 'first',
        href: opds_url(base, `/opds/libraries/${mediaId}?page=1`),
        type: OPDS_ACQ_TYPE,
      },
      {
        rel: 'last',
        href: opds_url(base, `/opds/libraries/${mediaId}?page=${totalPages}`),
        type: OPDS_ACQ_TYPE,
      },
    ]
    if (page > 1) {
      feedLinks.push({
        rel: 'previous',
        href: opds_url(base, `/opds/libraries/${mediaId}?page=${page - 1}`),
        type: OPDS_ACQ_TYPE,
      })
    }
    if (page < totalPages) {
      feedLinks.push({
        rel: 'next',
        href: opds_url(base, `/opds/libraries/${mediaId}?page=${page + 1}`),
        type: OPDS_ACQ_TYPE,
      })
    }

    const feed: OpdsFeed = {
      id: opds_url(base, `/opds/libraries/${mediaId}`),
      title: media.mediaName,
      kind: 'acquisition',
      updated: new Date(),
      totalResults: count,
      itemsPerPage: ps,
      startIndex: skip + 1,
      links: feedLinks,
      entries,
    }

    return send_xml(response, render_feed(feed), OPDS_ACQ_TYPE)
  }

  /** 某漫画下的章节列表 (分页) */
  public async manga_chapters({ request, response, params }: HttpContext) {
    const base = opds_base_url(request)
    const user = (request as any).user
    const mangaId = Number(params.mangaId)
    if (!Number.isFinite(mangaId)) return response.status(400).send('invalid mangaId')

    const manga = await prisma.manga.findUnique({ where: { mangaId } })
    if (!manga || manga.deleteFlag === 1) return response.status(404).send('manga not found')

    if (!user_can_access_media(user, manga.mediaId)) {
      return response.status(403).send('Forbidden')
    }

    const ps = page_size()
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const skip = (page - 1) * ps

    const where = { mangaId, deleteFlag: 0 }
    const [list, count] = await Promise.all([
      prisma.chapter.findMany({
        where,
        skip,
        take: ps,
        orderBy: [{ chapterNumber: 'asc' }, { chapterName: 'asc' }],
      }),
      prisma.chapter.count({ where }),
    ])

    const entries: OpdsEntry[] = list.map((c: any) => {
      const downloadType = chapter_mime(c.chapterPath)
      const links: OpdsLink[] = [
        {
          rel: 'http://opds-spec.org/acquisition',
          href: opds_url(base, `/opds/chapter/${c.chapterId}/download`),
          type: downloadType,
          title: '下载阅读',
        },
        {
          rel: 'alternate',
          href: opds_url(base, `/opds/chapter/${c.chapterId}`),
          type: OPDS_ENTRY_TYPE,
        },
      ]
      if (c.chapterCover || manga.mangaCover) {
        const coverUrl = c.chapterCover
          ? opds_url(base, `/opds/chapter/${c.chapterId}/cover`)
          : opds_url(base, `/opds/manga/${manga.mangaId}/cover`)
        const coverType = image_mime(c.chapterCover || manga.mangaCover)
        links.push({ rel: 'http://opds-spec.org/image', href: coverUrl, type: coverType })
        links.push({
          rel: 'http://opds-spec.org/image/thumbnail',
          href: coverUrl,
          type: coverType,
        })
      }
      return {
        id: opds_url(base, `/opds/chapter/${c.chapterId}`),
        title: c.chapterName,
        updated: c.updateTime || c.createTime || new Date(),
        summary: c.subTitle || undefined,
        links,
      }
    })

    const totalPages = Math.max(1, Math.ceil(count / ps))
    const feedLinks: OpdsLink[] = [
      {
        rel: 'self',
        href: opds_url(base, `/opds/manga/${mangaId}?page=${page}`),
        type: OPDS_ACQ_TYPE,
      },
      { rel: 'start', href: opds_url(base, '/opds'), type: OPDS_NAV_TYPE },
      {
        rel: 'up',
        href: opds_url(base, `/opds/libraries/${manga.mediaId}`),
        type: OPDS_ACQ_TYPE,
      },
      {
        rel: 'first',
        href: opds_url(base, `/opds/manga/${mangaId}?page=1`),
        type: OPDS_ACQ_TYPE,
      },
      {
        rel: 'last',
        href: opds_url(base, `/opds/manga/${mangaId}?page=${totalPages}`),
        type: OPDS_ACQ_TYPE,
      },
    ]
    if (page > 1) {
      feedLinks.push({
        rel: 'previous',
        href: opds_url(base, `/opds/manga/${mangaId}?page=${page - 1}`),
        type: OPDS_ACQ_TYPE,
      })
    }
    if (page < totalPages) {
      feedLinks.push({
        rel: 'next',
        href: opds_url(base, `/opds/manga/${mangaId}?page=${page + 1}`),
        type: OPDS_ACQ_TYPE,
      })
    }

    const feed: OpdsFeed = {
      id: opds_url(base, `/opds/manga/${mangaId}`),
      title: manga.title || manga.mangaName,
      subtitle: manga.author || undefined,
      kind: 'acquisition',
      updated: new Date(),
      totalResults: count,
      itemsPerPage: ps,
      startIndex: skip + 1,
      authors: manga.author ? [{ name: manga.author }] : undefined,
      links: feedLinks,
      entries,
    }

    // 引用 xml_escape 仅为消除未使用警告 (将作为 todo: 用于自定义渲染)
    void xml_escape

    return send_xml(response, render_feed(feed), OPDS_ACQ_TYPE)
  }

  /** 单章节 entry */
  public async chapter_entry({ request, response, params }: HttpContext) {
    const base = opds_base_url(request)
    const user = (request as any).user
    const chapterId = Number(params.chapterId)
    if (!Number.isFinite(chapterId)) return response.status(400).send('invalid chapterId')

    const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
    if (!chapter) return response.status(404).send('chapter not found')
    if (!user_can_access_media(user, chapter.mediaId)) {
      return response.status(403).send('Forbidden')
    }

    const links: OpdsLink[] = [
      {
        rel: 'http://opds-spec.org/acquisition',
        href: opds_url(base, `/opds/chapter/${chapterId}/download`),
        type: chapter_mime(chapter.chapterPath),
        title: '下载阅读',
      },
    ]
    if (chapter.chapterCover) {
      links.push({
        rel: 'http://opds-spec.org/image',
        href: opds_url(base, `/opds/chapter/${chapterId}/cover`),
        type: image_mime(chapter.chapterCover),
      })
    }

    const entry: OpdsEntry = {
      id: opds_url(base, `/opds/chapter/${chapterId}`),
      title: chapter.chapterName,
      updated: chapter.updateTime || chapter.createTime || new Date(),
      summary: chapter.subTitle || undefined,
      links,
    }

    return send_entry_xml(response, entry)
  }

  // --------------------------------------------------------------------------
  // 二进制资源接口: 下载/封面
  // --------------------------------------------------------------------------

  /** 下载章节文件 */
  public async chapter_download({ request, response, params }: HttpContext) {
    const user = (request as any).user
    const chapterId = Number(params.chapterId)
    if (!Number.isFinite(chapterId)) return response.status(400).send('invalid chapterId')

    const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
    if (!chapter) return response.status(404).send('chapter not found')
    if (!user_can_access_media(user, chapter.mediaId)) {
      return response.status(403).send('Forbidden')
    }

    if (!chapter.chapterPath || !fs.existsSync(chapter.chapterPath)) {
      return response.status(404).send('file not found')
    }

    const stat = fs.statSync(chapter.chapterPath)

    // A 方案: 仅支持文件型章节直接下载 (cbz/zip/rar/7z/pdf/epub)
    // img 目录型章节, 第一期不支持流式打包, 直接返回 415 提示用户在 Web 端阅读
    if (stat.isDirectory()) {
      return response
        .status(415)
        .send(
          'This chapter is a directory of images and cannot be downloaded as a single file in OPDS phase A.'
        )
    }

    const fileName = path.basename(chapter.chapterPath)
    response.header('Content-Type', chapter_mime(chapter.chapterPath))
    response.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    )
    response.header('Content-Length', String(stat.size))
    response.stream(fs.createReadStream(chapter.chapterPath))
    return response
  }

  /** 漫画封面 */
  public async manga_cover({ request, response, params }: HttpContext) {
    const user = (request as any).user
    const mangaId = Number(params.mangaId)
    if (!Number.isFinite(mangaId)) return response.status(400).send('invalid mangaId')

    const manga = await prisma.manga.findUnique({ where: { mangaId } })
    if (!manga) return response.status(404).send('manga not found')
    if (!user_can_access_media(user, manga.mediaId)) {
      return response.status(403).send('Forbidden')
    }
    return this.send_image(response, manga.mangaCover)
  }

  /** 章节封面 */
  public async chapter_cover({ request, response, params }: HttpContext) {
    const user = (request as any).user
    const chapterId = Number(params.chapterId)
    if (!Number.isFinite(chapterId)) return response.status(400).send('invalid chapterId')

    const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
    if (!chapter) return response.status(404).send('chapter not found')
    if (!user_can_access_media(user, chapter.mediaId)) {
      return response.status(403).send('Forbidden')
    }
    return this.send_image(response, chapter.chapterCover)
  }

  private send_image(response: any, file: string | null | undefined) {
    if (!file || !fs.existsSync(file) || !is_img(file)) {
      return response.status(404).send('image not found')
    }
    response.header('Content-Type', image_mime(file))
    response.header('Cache-Control', 'public, max-age=86400')
    response.stream(fs.createReadStream(file))
    return response
  }
}