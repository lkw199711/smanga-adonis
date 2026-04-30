/*
 * OPDS 1.2 (Atom) XML 渲染工具
 *
 * 不引入第三方依赖, 纯字符串拼接, 友好兼容 pkg/nexe 等 EXE 打包方案.
 *
 * 命名空间:
 *   atom        : http://www.w3.org/2005/Atom (默认)
 *   opds        : http://opds-spec.org/2010/catalog
 *   dc          : http://purl.org/dc/terms/
 */

// ----------------------------------------------------------------------------
// MIME 类型常量
// ----------------------------------------------------------------------------

/** OPDS 导航 feed (Acquisition Feed 同样使用此 type) */
export const OPDS_NAV_TYPE = 'application/atom+xml;profile=opds-catalog;kind=navigation'
export const OPDS_ACQ_TYPE = 'application/atom+xml;profile=opds-catalog;kind=acquisition'
export const OPDS_ENTRY_TYPE = 'application/atom+xml;type=entry;profile=opds-catalog'

/** 章节文件下载 MIME, 按扩展名映射 */
export function chapter_mime(filePath: string | null | undefined): string {
  if (!filePath) return 'application/octet-stream'
  const ext = filePath.toLowerCase().split('.').pop() || ''
  switch (ext) {
    case 'cbz':
      return 'application/vnd.comicbook+zip'
    case 'cbr':
      return 'application/vnd.comicbook-rar'
    case 'zip':
      return 'application/zip'
    case 'rar':
      return 'application/x-rar-compressed'
    case '7z':
      return 'application/x-7z-compressed'
    case 'pdf':
      return 'application/pdf'
    case 'epub':
      return 'application/epub+zip'
    default:
      return 'application/octet-stream'
  }
}

/** 图片 MIME */
export function image_mime(filePath: string | null | undefined): string {
  if (!filePath) return 'image/jpeg'
  const ext = filePath.toLowerCase().split('.').pop() || ''
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'bmp':
      return 'image/bmp'
    case 'svg':
      return 'image/svg+xml'
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg'
  }
}

// ----------------------------------------------------------------------------
// XML 转义
// ----------------------------------------------------------------------------

const XML_ENTITIES: Record<string, string> = {
  '&': '&' + 'amp;',
  '<': '&' + 'lt;',
  '>': '&' + 'gt;',
  '"': '&' + 'quot;',
  "'": '&' + 'apos;',
}

export function xml_escape(str: any): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/[&<>"']/g, (c) => XML_ENTITIES[c])
    // 控制字符过滤 (XML 1.0 不允许大多数控制字符)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

/** 将 Date 或 ISO 字符串格式化为 Atom 要求的 RFC3339 格式 */
export function atom_date(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString()
  if (d instanceof Date) return d.toISOString()
  const parsed = new Date(d)
  if (isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

// ----------------------------------------------------------------------------
// 类型定义
// ----------------------------------------------------------------------------

export interface OpdsLink {
  rel?: string | string[]
  href: string
  type?: string
  title?: string
  /** OPDS pse:count, 仅 PSE 流式扩展使用 (A 方案不用) */
  pseCount?: number
}

export interface OpdsAuthor {
  name: string
  uri?: string
}

export interface OpdsCategory {
  term: string
  label?: string
  scheme?: string
}

export interface OpdsEntry {
  id: string
  title: string
  updated?: Date | string
  authors?: OpdsAuthor[]
  summary?: string
  content?: string
  categories?: OpdsCategory[]
  links: OpdsLink[]
  /** dc:language */
  language?: string
  /** dc:publisher */
  publisher?: string
  /** dc:issued, 出版日期 */
  issued?: string
}

export interface OpdsFeed {
  id: string
  title: string
  updated?: Date | string
  authors?: OpdsAuthor[]
  /** OPDS feed kind, 用于决定 self link 的 type 与 itemsPerPage */
  kind?: 'navigation' | 'acquisition'
  /** 分页相关, 仅 acquisition feed 使用 */
  totalResults?: number
  itemsPerPage?: number
  startIndex?: number
  /** 顶层 link 列表 (self/start/up/next/prev/search 等) */
  links: OpdsLink[]
  entries: OpdsEntry[]
  /** feed 副标题 */
  subtitle?: string
  /** feed icon (favicon 类) */
  icon?: string
}

// ----------------------------------------------------------------------------
// 渲染函数
// ----------------------------------------------------------------------------

function render_link(link: OpdsLink): string {
  const rels = Array.isArray(link.rel) ? link.rel.join(' ') : link.rel
  const attrs: string[] = []
  if (rels) attrs.push(`rel="${xml_escape(rels)}"`)
  attrs.push(`href="${xml_escape(link.href)}"`)
  if (link.type) attrs.push(`type="${xml_escape(link.type)}"`)
  if (link.title) attrs.push(`title="${xml_escape(link.title)}"`)
  if (typeof link.pseCount === 'number') attrs.push(`pse:count="${link.pseCount}"`)
  return `  <link ${attrs.join(' ')}/>`
}

function render_author(author: OpdsAuthor): string {
  const parts = [`    <name>${xml_escape(author.name)}</name>`]
  if (author.uri) parts.push(`    <uri>${xml_escape(author.uri)}</uri>`)
  return `  <author>\n${parts.join('\n')}\n  </author>`
}

function render_category(cat: OpdsCategory): string {
  const attrs = [`term="${xml_escape(cat.term)}"`]
  if (cat.label) attrs.push(`label="${xml_escape(cat.label)}"`)
  if (cat.scheme) attrs.push(`scheme="${xml_escape(cat.scheme)}"`)
  return `  <category ${attrs.join(' ')}/>`
}

export function render_entry(entry: OpdsEntry): string {
  const lines: string[] = ['<entry>']
  lines.push(`  <id>${xml_escape(entry.id)}</id>`)
  lines.push(`  <title>${xml_escape(entry.title)}</title>`)
  lines.push(`  <updated>${atom_date(entry.updated)}</updated>`)

  if (entry.authors && entry.authors.length) {
    entry.authors.forEach((a) => lines.push(render_author(a).replace(/^/gm, '')))
  }

  if (entry.language) lines.push(`  <dc:language>${xml_escape(entry.language)}</dc:language>`)
  if (entry.publisher) lines.push(`  <dc:publisher>${xml_escape(entry.publisher)}</dc:publisher>`)
  if (entry.issued) lines.push(`  <dc:issued>${xml_escape(entry.issued)}</dc:issued>`)

  if (entry.categories) {
    entry.categories.forEach((c) => lines.push(render_category(c)))
  }

  if (entry.summary) {
    lines.push(`  <summary type="text">${xml_escape(entry.summary)}</summary>`)
  }
  if (entry.content) {
    lines.push(`  <content type="text">${xml_escape(entry.content)}</content>`)
  }

  entry.links.forEach((l) => lines.push(render_link(l)))

  lines.push('</entry>')
  return lines.join('\n')
}

export function render_feed(feed: OpdsFeed): string {
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push(
    '<feed xmlns="http://www.w3.org/2005/Atom"' +
      ' xmlns:opds="http://opds-spec.org/2010/catalog"' +
      ' xmlns:dc="http://purl.org/dc/terms/"' +
      ' xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">'
  )
  lines.push(`  <id>${xml_escape(feed.id)}</id>`)
  lines.push(`  <title>${xml_escape(feed.title)}</title>`)
  if (feed.subtitle) lines.push(`  <subtitle>${xml_escape(feed.subtitle)}</subtitle>`)
  if (feed.icon) lines.push(`  <icon>${xml_escape(feed.icon)}</icon>`)
  lines.push(`  <updated>${atom_date(feed.updated)}</updated>`)

  if (feed.authors) {
    feed.authors.forEach((a) => lines.push(render_author(a)))
  }

  // 分页元数据 (OpenSearch)
  if (typeof feed.totalResults === 'number') {
    lines.push(`  <opensearch:totalResults>${feed.totalResults}</opensearch:totalResults>`)
  }
  if (typeof feed.itemsPerPage === 'number') {
    lines.push(`  <opensearch:itemsPerPage>${feed.itemsPerPage}</opensearch:itemsPerPage>`)
  }
  if (typeof feed.startIndex === 'number') {
    lines.push(`  <opensearch:startIndex>${feed.startIndex}</opensearch:startIndex>`)
  }

  feed.links.forEach((l) => lines.push(render_link(l)))

  feed.entries.forEach((e) => {
    lines.push(render_entry(e).replace(/^/gm, '  '))
  })

  lines.push('</feed>')
  return lines.join('\n')
}

// ----------------------------------------------------------------------------
// URL 构造工具
// ----------------------------------------------------------------------------

/**
 * 计算 OPDS 链接的 base URL.
 *  - 优先使用 .env 里的 OPDS_BASE_URL
 *  - 否则根据请求的 protocol + host 推断
 */
export function opds_base_url(request: { protocol(): string; header(name: string): any }): string {
  const envBase = (process.env.OPDS_BASE_URL || '').trim()
  if (envBase) return envBase.replace(/\/+$/, '')

  // X-Forwarded-* 优先 (反向代理场景)
  const xfProto = request.header('x-forwarded-proto')
  const xfHost = request.header('x-forwarded-host')
  const proto = (Array.isArray(xfProto) ? xfProto[0] : xfProto) || request.protocol() || 'http'
  const host = (Array.isArray(xfHost) ? xfHost[0] : xfHost) || request.header('host') || ''
  return `${proto}://${host}`.replace(/\/+$/, '')
}

/** 拼接绝对 OPDS URL */
export function opds_url(base: string, pathname: string): string {
  if (!pathname.startsWith('/')) pathname = '/' + pathname
  return base + pathname
}