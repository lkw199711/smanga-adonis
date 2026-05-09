import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { order_params } from '../utils/index.js'
import { searchMangaValidator, searchChapterValidator } from '#validators/search'

export default class SearchesController {
  public async mangas({ request, response }: HttpContext) {
    const { searchText, page, pageSize, order } = await searchMangaValidator.validate(
      request.qs()
    )

    const userId = (request as any).userId
    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return response
        .status(401)
        .json(new SResponse({ code: 401, message: '用户不存在', status: 'token error' }))
    }
    const isAdmin = user.role === 'admin' || user.mediaPermit === 'all'
    const mediaPermissons =
      (await prisma.mediaPermisson.findMany({
        where: { userId },
        select: { mediaId: true },
      })) || []

    const quertParams = {
      where: {
        subTitle: {
          contains: searchText,
        },
        ...(!isAdmin && { mediaId: { in: mediaPermissons.map((item) => item.mediaId) } }),
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: order_params(order, 'manga'),
    }

    const [list, count] = await Promise.all([
      prisma.manga.findMany(quertParams),
      prisma.manga.count({ where: quertParams.where }),
    ])

    // 批量统计未观看章节数
    const mangaIds = list.map((m: any) => m.mangaId)
    const [chapterCounts, historyCounts] = await Promise.all([
      prisma.chapter.groupBy({
        by: ['mangaId'],
        where: { mangaId: { in: mangaIds } },
        _count: { chapterId: true },
      }),
      prisma.history.groupBy({
        by: ['mangaId', 'chapterId'],
        where: { mangaId: { in: mangaIds }, userId },
      }),
    ])

    const chapterCountMap = new Map(
      chapterCounts.map((item: any) => [item.mangaId, item._count.chapterId])
    )
    const historyCountMap = new Map<number, number>()
    for (const item of historyCounts) {
      historyCountMap.set(item.mangaId, (historyCountMap.get(item.mangaId) || 0) + 1)
    }

    list.forEach((manga: any) => {
      const total = chapterCountMap.get(manga.mangaId) || 0
      const watched = historyCountMap.get(manga.mangaId) || 0
      manga.unWatched = Math.max(total - watched, 0)
    })

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })
    return response.json(listResponse)
  }

  public async chapters({ request, response }: HttpContext) {
    const { searchText, page, pageSize, order } = await searchChapterValidator.validate(
      request.qs()
    )

    const userId = (request as any).userId
    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return response
        .status(401)
        .json(new SResponse({ code: 401, message: '用户不存在', status: 'token error' }))
    }
    const isAdmin = user.role === 'admin' || user.mediaPermit === 'all'
    const mediaPermissons =
      (await prisma.mediaPermisson.findMany({
        where: { userId },
        select: { mediaId: true },
      })) || []

    const quertParams = {
      where: {
        subTitle: {
          contains: searchText,
        },
        ...(!isAdmin && { mediaId: { in: mediaPermissons.map((item) => item.mediaId) } }),
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: order_params(order, 'chapter'),
    }

    const [list, count] = await Promise.all([
      prisma.chapter.findMany(quertParams),
      prisma.chapter.count({ where: quertParams.where }),
    ])

    // 批量查询 latest
    const chapterIds = list.map((c: any) => c.chapterId).filter(Boolean)
    const latests = chapterIds.length
      ? await prisma.latest.findMany({
          where: { userId, chapterId: { in: chapterIds } },
        })
      : []
    const latestMap = new Map(latests.map((l: any) => [l.chapterId, l]))

    list.forEach((chapter: any) => {
      chapter.latest = latestMap.get(chapter.chapterId) || null
    })

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })

    return response.json(listResponse)
  }
}
