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
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')
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
import { is_img, image_files, path_compress } from '#utils/index'
import { unzipFile } from '#utils/unzip'
import sharp from 'sharp'

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
    ' xmlns:dc="http://purl.org/dc/terms/"' +
    ' xmlns:pse="http://vaemendis.net/opds-pse/ns">\n'
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

/**
 * 决定一个章节下载接口返回的 MIME:
 *  - 目录型 (chapterType === 'img'): 被临时打包为 CBZ
 *  - 其它: 按文件扩展名推断
 */
function download_mime_for_chapter(c: any): string {
  if (c?.chapterType === 'img') return 'application/vnd.comicbook+zip'
  return chapter_mime(c?.chapterPath)
}

// ----------------------------------------------------------------------------
// 复用的 feed/entry 构造器
// ----------------------------------------------------------------------------

/** 把一条 manga 记录转成 OPDS entry */
function manga_to_entry(base: string, m: any): OpdsEntry {
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
    updated: m.chapterUpdate || m.updateTime || m.createTime || new Date(),
    authors: m.author ? [{ name: m.author }] : undefined,
    summary: m.describe || undefined,
    issued: m.publishDate ? new Date(m.publishDate).toISOString().slice(0, 10) : undefined,
    links,
  }
}

interface PaginatedFeedArgs {
  base: string
  selfPath: string // 如 '/opds/latest' 或 '/opds/libraries/1'
  upPath: string
  title: string
  subtitle?: string
  count: number
  ps: number
  page: number
  skip: number
  entries: OpdsEntry[]
  /** self/up 使用的额外 query (自动追加 &page=N) */
  extraQuery?: string
}

/** 构造带分页链接 (self/first/last/prev/next) 的 acquisition feed */
function make_paginated_feed(a: PaginatedFeedArgs): OpdsFeed {
  const totalPages = Math.max(1, Math.ceil(a.count / a.ps))
  const q = a.extraQuery ? `${a.extraQuery}&` : ''
  const page_url = (p: number) => opds_url(a.base, `${a.selfPath}?${q}page=${p}`)

  const links: OpdsLink[] = [
    { rel: 'self', href: page_url(a.page), type: OPDS_ACQ_TYPE },
    { rel: 'start', href: opds_url(a.base, '/opds'), type: OPDS_NAV_TYPE },
    { rel: 'up', href: opds_url(a.base, a.upPath), type: OPDS_NAV_TYPE },
    { rel: 'first', href: page_url(1), type: OPDS_ACQ_TYPE },
    { rel: 'last', href: page_url(totalPages), type: OPDS_ACQ_TYPE },
  ]
  if (a.page > 1) {
    links.push({ rel: 'previous', href: page_url(a.page - 1), type: OPDS_ACQ_TYPE })
  }
  if (a.page < totalPages) {
    links.push({ rel: 'next', href: page_url(a.page + 1), type: OPDS_ACQ_TYPE })
  }

  return {
    id: opds_url(a.base, a.selfPath),
    title: a.title,
    subtitle: a.subtitle,
    kind: 'acquisition',
    updated: new Date(),
    totalResults: a.count,
    itemsPerPage: a.ps,
    startIndex: a.skip + 1,
    links,
    entries: a.entries,
  }
}

// ----------------------------------------------------------------------------
// Controller
// ----------------------------------------------------------------------------

export default class OpdsController {
  /** 根 catalog: 提供进入媒体库列表的入口 */
  public async root({ request, response }: HttpContext) {
    const base = opds_base_url(request)
    const now = new Date()

    const feed: OpdsFeed = {
      id: opds_url(base, '/opds'),
      title: 'smanga',
      subtitle: 'OPDS catalog',
      kind: 'navigation',
      updated: now,
      links: [
        { rel: 'self', href: opds_url(base, '/opds'), type: OPDS_NAV_TYPE },
        { rel: 'start', href: opds_url(base, '/opds'), type: OPDS_NAV_TYPE },
        {
          rel: 'search',
          href: opds_url(base, '/opds/opensearch.xml'),
          type: 'application/opensearchdescription+xml',
          title: '搜索漫画',
        },
      ],
      entries: [
        {
          id: opds_url(base, '/opds/libraries'),
          title: '媒体库',
          updated: now,
          summary: '浏览全部媒体库',
          links: [
            {
              rel: 'subsection',
              href: opds_url(base, '/opds/libraries'),
              type: OPDS_NAV_TYPE,
            },
          ],
        },
        {
          id: opds_url(base, '/opds/latest'),
          title: '最近更新',
          updated: now,
          summary: '按更新时间排列的漫画',
          links: [
            {
              rel: ['subsection', 'http://opds-spec.org/sort/new'],
              href: opds_url(base, '/opds/latest'),
              type: OPDS_ACQ_TYPE,
            },
          ],
        },
        {
          id: opds_url(base, '/opds/collects'),
          title: '我的收藏',
          updated: now,
          summary: '我收藏的漫画',
          links: [
            {
              rel: 'subsection',
              href: opds_url(base, '/opds/collects'),
              type: OPDS_ACQ_TYPE,
            },
          ],
        },
        {
          id: opds_url(base, '/opds/search?q={searchTerms}'),
          title: '搜索',
          updated: now,
          summary: '在漫画标题中搜索',
          links: [
            {
              rel: 'search',
              href: opds_url(base, '/opds/opensearch.xml'),
              type: 'application/opensearchdescription+xml',
            },
          ],
        },
      ],
    }

    return send_xml(response, render_feed(feed), OPDS_NAV_TYPE)
  }

  /**
   * OpenSearch 描述文档
   * 客户端通过该文档得知搜索入口 URL 模板.
   */
  public async opensearch({ request, response }: HttpContext) {
    const base = opds_base_url(request)
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">\n' +
      '  <ShortName>smanga</ShortName>\n' +
      '  <Description>Search mangas in smanga library</Description>\n' +
      '  <InputEncoding>UTF-8</InputEncoding>\n' +
      `  <Url type="${OPDS_ACQ_TYPE}"` +
      `       template="${opds_url(base, '/opds/search?q={searchTerms}&amp;page={startPage?}')}"/>\n` +
      '</OpenSearchDescription>\n'
    response.header('Content-Type', 'application/opensearchdescription+xml; charset=utf-8')
    response.header('Cache-Control', 'public, max-age=3600')
    return response.send(xml)
  }

  /** 搜索漫画 (按 title / mangaName / subTitle / author 模糊) */
  public async search({ request, response }: HttpContext) {
    const base = opds_base_url(request)
    const user = (request as any).user
    const q = String(request.input('q', '')).trim()
    const ps = page_size()
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const skip = (page - 1) * ps

    let entries: OpdsEntry[] = []
    let count = 0
    if (q) {
      const baseWhere: any = {
        deleteFlag: 0,
        ...media_where_for_user(user),
        OR: [
          { mangaName: { contains: q } },
          { title: { contains: q } },
          { subTitle: { contains: q } },
          { author: { contains: q } },
        ],
      }
      const [list, total] = await Promise.all([
        prisma.manga.findMany({
          where: baseWhere,
          skip,
          take: ps,
          orderBy: { updateTime: 'desc' },
        }),
        prisma.manga.count({ where: baseWhere }),
      ])
      count = total
      entries = list.map((m: any) => manga_to_entry(base, m))
    }

    const totalPages = Math.max(1, Math.ceil(count / ps))
    const qEncoded = encodeURIComponent(q)
    const feedLinks: OpdsLink[] = [
      {
        rel: 'self',
        href: opds_url(base, `/opds/search?q=${qEncoded}&page=${page}`),
        type: OPDS_ACQ_TYPE,
      },
      { rel: 'start', href: opds_url(base, '/opds'), type: OPDS_NAV_TYPE },
      { rel: 'up', href: opds_url(base, '/opds'), type: OPDS_NAV_TYPE },
    ]
    if (page > 1) {
      feedLinks.push({
        rel: 'previous',
        href: opds_url(base, `/opds/search?q=${qEncoded}&page=${page - 1}`),
        type: OPDS_ACQ_TYPE,
      })
    }
    if (page < totalPages) {
      feedLinks.push({
        rel: 'next',
        href: opds_url(base, `/opds/search?q=${qEncoded}&page=${page + 1}`),
        type: OPDS_ACQ_TYPE,
      })
    }

    const feed: OpdsFeed = {
      id: opds_url(base, `/opds/search?q=${qEncoded}`),
      title: q ? `搜索: ${q}` : '搜索',
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

  /** 最近更新的漫画 (按 updateTime 倒序) */
  public async latest({ request, response }: HttpContext) {
    const base = opds_base_url(request)
    const user = (request as any).user
    const ps = page_size()
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const skip = (page - 1) * ps

    const where = { deleteFlag: 0, ...media_where_for_user(user) }
    const [list, count] = await Promise.all([
      prisma.manga.findMany({
        where,
        skip,
        take: ps,
        orderBy: [{ chapterUpdate: 'desc' }, { updateTime: 'desc' }],
      }),
      prisma.manga.count({ where }),
    ])

    const entries = list.map((m: any) => manga_to_entry(base, m))
    const feed = make_paginated_feed({
      base,
      selfPath: '/opds/latest',
      upPath: '/opds',
      title: '最近更新',
      count,
      ps,
      page,
      skip,
      entries,
    })
    return send_xml(response, render_feed(feed), OPDS_ACQ_TYPE)
  }

  /** 我的收藏 (漫画维度) */
  public async collects({ request, response }: HttpContext) {
    const base = opds_base_url(request)
    const user = (request as any).user
    const userId: number = user.userId
    const ps = page_size()
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const skip = (page - 1) * ps

    const where = { userId, collectType: 'manga' }
    const [list, count] = await Promise.all([
      prisma.collect.findMany({
        where,
        skip,
        take: ps,
        orderBy: { updateTime: 'desc' },
        include: { manga: true },
      }),
      prisma.collect.count({ where }),
    ])

    // 过滤掉无权限访问的媒体 (避免共享账号泄露)
    const entries: OpdsEntry[] = []
    for (const c of list) {
      const m: any = c.manga
      if (!m || m.deleteFlag === 1) continue
      if (!user_can_access_media(user, m.mediaId)) continue
      entries.push(manga_to_entry(base, m))
    }

    const feed = make_paginated_feed({
      base,
      selfPath: '/opds/collects',
      upPath: '/opds',
      title: '我的收藏',
      count,
      ps,
      page,
      skip,
      entries,
    })
    return send_xml(response, render_feed(feed), OPDS_ACQ_TYPE)
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
      const downloadType = download_mime_for_chapter(c)
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
      // PSE 流式翻页 (目录型 / 压缩包章节均可, pdf 不支持)
      if (c.chapterType !== 'pdf') {
        const pseLink: OpdsLink = {
          rel: 'http://vaemendis.net/opds-pse/stream',
          href: opds_url(
            base,
            `/opds/chapter/${c.chapterId}/page/{pageNumber}?width={maxWidth}`
          ),
          type: 'image/jpeg',
        }
        if (typeof c.picNum === 'number' && c.picNum > 0) pseLink.pseCount = c.picNum
        links.push(pseLink)
      }
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
        type: download_mime_for_chapter(chapter),
        title: '下载阅读',
      },
    ]
    if (chapter.chapterType !== 'pdf') {
      const pseLink: OpdsLink = {
        rel: 'http://vaemendis.net/opds-pse/stream',
        href: opds_url(
          base,
          `/opds/chapter/${chapterId}/page/{pageNumber}?width={maxWidth}`
        ),
        type: 'image/jpeg',
      }
      if (typeof chapter.picNum === 'number' && chapter.picNum > 0) {
        pseLink.pseCount = chapter.picNum
      }
      links.push(pseLink)
    }
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

    // 目录型章节: 临时打包成 CBZ (Comic Book Zip) 返回
    if (stat.isDirectory()) {
      return this.stream_directory_as_cbz(response, chapter)
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

  /**
   * 将图片目录型章节即时打包为 CBZ 输出.
   * 采用 adm-zip 在内存构建 (单章节通常 < 200MB, 可接受).
   * 如果未来遇到超大章节, 可替换为 archiver 真流式实现.
   */
  private async stream_directory_as_cbz(response: any, chapter: any) {
    // 获取路径排除规则
    const pathInfo = await prisma.path.findUnique({ where: { pathId: chapter.pathId } })
    const exclude = pathInfo?.exclude || ''

    const imgs = image_files(chapter.chapterPath, exclude).sort()
    if (!imgs.length) {
      return response.status(404).send('no images in chapter')
    }

    const zip = new AdmZip()
    // 按自然顺序补零, 保证阅读器按文件名排序时图片顺序稳定
    const pad = Math.max(3, String(imgs.length).length)
    imgs.forEach((img, idx) => {
      const ext = path.extname(img) || '.jpg'
      const entryName = `${String(idx + 1).padStart(pad, '0')}${ext}`
      try {
        zip.addLocalFile(img, '', entryName)
      } catch (e) {
        // 单个文件失败不影响整体, 忽略
      }
    })

    const buffer: Buffer = zip.toBuffer()
    const safeName = (chapter.chapterName || `chapter_${chapter.chapterId}`).replace(
      /[\\/:*?"<>|]/g,
      '_'
    )
    const fileName = `${safeName}.cbz`
    response.header('Content-Type', 'application/vnd.comicbook+zip')
    response.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    )
    response.header('Content-Length', String(buffer.byteLength))
    return response.send(buffer)
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

  // --------------------------------------------------------------------------
  // C 方案: OPDS-PSE 流式翻页
  //
  // 规范: https://vaemendis.net/opds-pse/
  //   - 命名空间: http://vaemendis.net/opds-pse/ns
  //   - rel:     http://vaemendis.net/opds-pse/stream
  //   - 页码从 1 开始, URL 内 {pageNumber} 与 {maxWidth} 为字面占位符
  //
  // 支持章节类型:
  //   - img  目录型: 直接索引 image_files
  //   - zip/rar/7z 压缩包: 复用 compress 缓存表; 若未解压则首次同步解压
  //   - pdf  不支持 PSE (pdf 直接下载阅读)
  // --------------------------------------------------------------------------

  /**
   * 取得章节按自然顺序排好的图片绝对路径列表.
   * 压缩包章节会在首次访问时触发同步解压 (与 images 接口共用 compress 表).
   * 返回 null 表示章节不支持 PSE 翻页 (例如 pdf 或图片为空).
   */
  private async resolve_chapter_images(chapter: any): Promise<string[] | null> {
    if (!chapter?.chapterPath || !fs.existsSync(chapter.chapterPath)) return null

    // 目录型 / img 类型
    if (chapter.chapterType === 'img') {
      const pathInfo = await prisma.path.findUnique({ where: { pathId: chapter.pathId } })
      const exclude = pathInfo?.exclude || ''
      const list = image_files(chapter.chapterPath, exclude).sort()
      return list.length ? list : null
    }

    // 兼容: 目录但 chapterType 被标为其他
    const stat = fs.statSync(chapter.chapterPath)
    if (stat.isDirectory()) {
      const pathInfo = await prisma.path.findUnique({ where: { pathId: chapter.pathId } })
      const exclude = pathInfo?.exclude || ''
      const list = image_files(chapter.chapterPath, exclude).sort()
      return list.length ? list : null
    }

    // pdf 不支持 PSE
    if (chapter.chapterType === 'pdf') return null

    // 压缩包: 走 compress 解压缓存
    const compress: any = await prisma.compress.findUnique({
      where: { chapterId: chapter.chapterId },
    })
    const pathInfo = await prisma.path.findUnique({ where: { pathId: chapter.pathId } })
    const exclude = pathInfo?.exclude || ''

    if (compress && fs.existsSync(compress.compressPath)) {
      const list = image_files(compress.compressPath, exclude).sort()
      return list.length ? list : null
    }

    // 首次解压 (同步). 不修改 compress 表以免与既有任务系统冲突, 只做临时解压.
    const compressPath = path.join(
      path_compress(),
      `smanga_chapter_${chapter.chapterId}`
    )
    try {
      if (!fs.existsSync(compressPath)) fs.mkdirSync(compressPath, { recursive: true })
      // 仅对 zip 直接支持, rar/7z 延用原有任务体系失败时返回 null
      if (chapter.chapterType === 'zip') {
        unzipFile(chapter.chapterPath, compressPath)
      } else {
        // 其他压缩格式走原逻辑 (等后台任务处理), 此时返回 null
        return null
      }
    } catch {
      return null
    }

    // 幂等写入 compress 记录 (best-effort, 失败忽略)
    try {
      await prisma.compress.upsert({
        where: { chapterId: chapter.chapterId },
        update: { compressPath, compressStatus: 'compressed' },
        create: {
          chapter: { connect: { chapterId: chapter.chapterId } },
          chapterPath: chapter.chapterPath,
          manga: { connect: { mangaId: chapter.mangaId } },
          mediaId: chapter.mediaId,
          compressType: chapter.chapterType,
          compressPath,
          compressStatus: 'compressed',
        },
      })
    } catch {
      // ignore
    }

    const list = image_files(compressPath, exclude).sort()
    return list.length ? list : null
  }

  /**
   * PSE 流式翻页接口:
   *   GET /opds/chapter/:chapterId/page/:page?width=<n>
   * 返回第 page (1-based) 张图片, 可选按 width 缩图.
   */
  public async chapter_page({ request, response, params }: HttpContext) {
    const user = (request as any).user
    const chapterId = Number(params.chapterId)
    const page = Number(params.page)
    if (!Number.isFinite(chapterId) || !Number.isFinite(page) || page < 1) {
      return response.status(400).send('invalid params')
    }

    const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
    if (!chapter) return response.status(404).send('chapter not found')
    if (!user_can_access_media(user, chapter.mediaId)) {
      return response.status(403).send('Forbidden')
    }

    const imgs = await this.resolve_chapter_images(chapter)
    if (!imgs || imgs.length === 0) {
      return response.status(404).send('no images available')
    }

    const idx = Math.floor(page) - 1
    if (idx < 0 || idx >= imgs.length) {
      return response.status(404).send('page out of range')
    }

    const imgPath = imgs[idx]
    if (!fs.existsSync(imgPath)) return response.status(404).send('image missing')

    // 可选按 width 缩图 (PSE maxWidth 语义: 不放大, 仅等比缩小)
    const widthRaw = request.input('width', '')
    const width = Number(widthRaw)
    const wantResize = Number.isFinite(width) && width > 0 && width < 10000

    response.header('Cache-Control', 'public, max-age=3600')

    if (!wantResize) {
      response.header('Content-Type', image_mime(imgPath))
      response.stream(fs.createReadStream(imgPath))
      return response
    }

    // 使用 sharp 按需缩图输出 jpeg (兼容性最佳)
    try {
      const buf = await sharp(imgPath)
        .resize({ width: Math.floor(width), withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer()
      response.header('Content-Type', 'image/jpeg')
      response.header('Content-Length', String(buf.byteLength))
      return response.send(buf)
    } catch {
      // 降级: 直接返回原图
      response.header('Content-Type', image_mime(imgPath))
      response.stream(fs.createReadStream(imgPath))
      return response
    }
  }
}