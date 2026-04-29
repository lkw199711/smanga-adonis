/*
 * @description: HomePage (gethomepage.dev) customapi 适配接口
 *               提供漫画系统的基础聚合统计数据，用于 homepage 仪表盘展示。
 *               参考: https://gethomepage.dev/widgets/services/customapi/
 */
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import prisma from '#start/prisma'
import { SResponse } from '../interfaces/response.js'

export default class HomepageController {
  /**
   * 校验 homepage 调用方提供的 apikey
   * - 优先从 query 中读取 apikey
   * - 兼容 header: X-API-Key / Authorization: Bearer xxx
   * - 若 .env 中未设置 HOMEPAGE_API_KEY 则不做强校验，方便本地调试
   */
  private verify_apikey(ctx: HttpContext): boolean {
    const configKey = env.get('HOMEPAGE_API_KEY') as string | undefined
    if (!configKey) return true

    const { request } = ctx
    const queryKey = request.input('apikey') || request.input('apiKey') || request.input('api_key')
    const headerKey =
      request.header('x-api-key') ||
      request.header('X-API-Key') ||
      (request.header('authorization') || '').replace(/^Bearer\s+/i, '')

    return queryKey === configKey || headerKey === configKey
  }

  /**
   * GET /homepage/statistic
   * 返回扁平化字段，便于 homepage customapi 的 mappings 直接引用。
   */
  public async statistic(ctx: HttpContext) {
    const { response } = ctx

    if (!this.verify_apikey(ctx)) {
      return response.status(401).json(
        new SResponse({
          code: 1,
          message: 'invalid apikey',
          status: 'apikey error',
        })
      )
    }

    // 时间区间
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - 6)

    // 并发查询所有统计数据
    const [
      mediaCount,
      mangaCount,
      chapterCount,
      tagCount,
      userCount,
      collectCount,
      bookmarkCount,
      historyCount,
      todayViews,
      weekViews,
      latestManga,
      latestChapter,
    ] = await Promise.all([
      prisma.media.count({ where: { deleteFlag: 0 } }),
      prisma.manga.count({ where: { deleteFlag: 0 } }),
      prisma.chapter.count({ where: { deleteFlag: 0 } }),
      prisma.tag.count(),
      prisma.user.count(),
      prisma.collect.count(),
      prisma.bookmark.count(),
      prisma.history.count(),
      prisma.history.count({ where: { createTime: { gte: todayStart } } }),
      prisma.history.count({ where: { createTime: { gte: weekStart } } }),
      prisma.manga.findFirst({
        where: { deleteFlag: 0 },
        orderBy: { createTime: 'desc' },
        select: { mangaId: true, mangaName: true, createTime: true },
      }),
      prisma.chapter.findFirst({
        where: { deleteFlag: 0 },
        orderBy: { createTime: 'desc' },
        select: { chapterId: true, chapterName: true, mangaId: true, createTime: true },
      }),
    ])

    const data = {
      // 主要统计字段（homepage customapi mappings 推荐字段）
      media_count: mediaCount,
      manga_count: mangaCount,
      chapter_count: chapterCount,
      tag_count: tagCount,
      user_count: userCount,
      collect_count: collectCount,
      bookmark_count: bookmarkCount,
      history_count: historyCount,
      today_views: todayViews,
      week_views: weekViews,
      // 最新入库展示
      latest_manga: latestManga?.mangaName || '',
      latest_manga_time: latestManga?.createTime || null,
      latest_chapter: latestChapter?.chapterName || '',
      latest_chapter_time: latestChapter?.createTime || null,
      // 服务信息
      server_time: now.toISOString(),
    }

    return response.json(new SResponse({ code: 0, data, message: '' }))
  }
}