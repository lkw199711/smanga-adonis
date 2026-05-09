import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import {
  listCollectValidator,
  idParamCollectValidator,
  mangaParamCollectValidator,
  collectMangaBodyValidator,
  chapterParamCollectValidator,
  collectChapterBodyValidator,
  createCollectValidator,
  updateCollectValidator,
  isCollectMangaParamValidator,
  isCollectChapterParamValidator,
} from '#validators/collect'

export default class CollectsController {
  public async index({ request, response }: HttpContext) {
    const { userId } = request as any
    const collect = await prisma.collect.findMany({ where: { userId } })
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list: collect,
      count: collect.length,
    })
    return response.json(listResponse)
  }

  public async mangas({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, pageSize } = await listCollectValidator.validate(request.qs())

    const where = { userId, collectType: 'manga' }
    const queryParams = {
      where,
      include: {
        manga: {
          select: {
            mangaId: true,
            mangaName: true,
            mangaCover: true,
            mediaId: true,
            browseType: true,
            removeFirst: true,
            describe: true,
          },
        },
      },
      ...(page && pageSize && { skip: (page - 1) * pageSize, take: pageSize }),
    }

    const [list, count] = await Promise.all([
      prisma.collect.findMany(queryParams),
      prisma.collect.count({ where }),
    ])

    // 批量统计未观看章节数
    const mangaIds = list.map((item: any) => item.mangaId).filter(Boolean)
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
      manga.unWatched = total - watched
    })

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list: list.map((item) => {
        return {
          ...item,
          ...item.manga,
        }
      }),
      count,
    })
    return response.json(listResponse)
  }

  public async chapters({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, pageSize } = await listCollectValidator.validate(request.qs())

    const where = { userId, collectType: 'chapter' }
    const queryParams = {
      where,
      include: {
        chapter: {
          select: {
            chapterId: true,
            chapterName: true,
            chapterCover: true,
          },
        },
        manga: {
          select: {
            mediaId: true,
            mangaId: true,
            browseType: true,
            removeFirst: true,
            describe: true,
          },
        },
      },
      ...(page && pageSize && { skip: (page - 1) * pageSize, take: pageSize }),
    }

    const [list, count] = await Promise.all([
      prisma.collect.findMany(queryParams),
      prisma.collect.count({ where }),
    ])

    // 批量查询 latest 记录
    const chapterIds = list.map((item: any) => item.chapterId).filter(Boolean)
    const latests = chapterIds.length
      ? await prisma.latest.findMany({
          where: { userId, chapterId: { in: chapterIds } },
        })
      : []
    const latestMap = new Map(latests.map((l: any) => [l.chapterId, l]))

    list.forEach((chapter: any) => {
      chapter.latest = chapter.chapterId ? latestMap.get(chapter.chapterId) || null : null
    })

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list: list.map((item) => {
        return {
          ...item,
          ...item.chapter,
          ...item.manga,
        }
      }),
      count,
    })
    return response.json(listResponse)
  }

  public async collect_manga({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const { mangaId } = await mangaParamCollectValidator.validate(params)
    const { mangaName, mediaId } = await collectMangaBodyValidator.validate(request.all())

    const existing = await prisma.collect.findFirst({
      where: { userId, mangaId, collectType: 'manga' },
    })

    if (existing) {
      const deleted = await prisma.collect.delete({ where: { collectId: existing.collectId } })
      const destroyResponse = new SResponse({ code: 0, message: '取消收藏成功', data: deleted })
      return response.json(destroyResponse)
    } else {
      const collect = await prisma.collect.create({
        data: {
          collectType: 'manga',
          userId,
          mediaId,
          mangaId,
          mangaName,
        } as any,
      })

      const saveResponse = new SResponse({ code: 0, message: '收藏成功', data: collect })
      return response.json(saveResponse)
    }
  }

  public async collect_chapter({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId } = await chapterParamCollectValidator.validate(params)
    const { chapterName, mediaId, mangaId, mangaName } = await collectChapterBodyValidator.validate(
      request.all()
    )

    const existing = await prisma.collect.findFirst({
      where: { userId, chapterId, collectType: 'chapter' },
    })

    if (existing) {
      const deleted = await prisma.collect.delete({ where: { collectId: existing.collectId } })
      const destroyResponse = new SResponse({ code: 0, message: '取消收藏成功', data: deleted })
      return response.json(destroyResponse)
    } else {
      const collect = await prisma.collect.create({
        data: {
          collectType: 'chapter',
          userId,
          mediaId,
          mangaId,
          mangaName,
          chapterId,
          chapterName,
        } as any,
      })

      const saveResponse = new SResponse({ code: 0, message: '收藏成功', data: collect })
      return response.json(saveResponse)
    }
  }

  public async create({ request, response }: HttpContext) {
    const { userId } = request as any
    const data = await createCollectValidator.validate(request.all())
    const collect = await prisma.collect.create({ data: { ...data, userId } as any })

    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: collect })
    return response.json(saveResponse)
  }

  public async show({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const { collectId } = await idParamCollectValidator.validate(params)
    const collect = await prisma.collect.findFirst({ where: { collectId, userId } })
    if (!collect) {
      return response.status(404).json(new SResponse({ code: 404, message: '收藏不存在' }))
    }
    const showResponse = new SResponse({ code: 0, message: '', data: collect })
    return response.json(showResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const { collectId } = await idParamCollectValidator.validate(params)

    const existing = await prisma.collect.findFirst({ where: { collectId, userId } })
    if (!existing) {
      return response.status(404).json(new SResponse({ code: 404, message: '收藏不存在' }))
    }

    const data = await updateCollectValidator.validate(request.all())
    const collect = await prisma.collect.update({
      where: { collectId },
      data,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: collect })
    return response.json(updateResponse)
  }

  public async is_collect({ request, params, response }: HttpContext) {
    const { userId } = request as any

    // 路由上 mangaId 和 chapterId 互斥, 根据存在的字段分别走不同校验
    if (params.mangaId !== undefined) {
      const { mangaId } = await isCollectMangaParamValidator.validate(params)
      const collect = await prisma.collect.findFirst({
        where: { mangaId, chapterId: null, userId },
      })
      return response.json(new SResponse({ code: 0, message: '', data: !!collect }))
    }

    if (params.chapterId !== undefined) {
      const { chapterId } = await isCollectChapterParamValidator.validate(params)
      const collect = await prisma.collect.findFirst({
        where: { chapterId, userId },
      })
      return response.json(new SResponse({ code: 0, message: '', data: !!collect }))
    }

    return response.json(new SResponse({ code: 0, message: '', data: false }))
  }

  public async destroy({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const { collectId } = await idParamCollectValidator.validate(params)

    const existing = await prisma.collect.findFirst({ where: { collectId, userId } })
    if (!existing) {
      return response.status(404).json(new SResponse({ code: 404, message: '收藏不存在' }))
    }

    const collect = await prisma.collect.delete({ where: { collectId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: collect })
    return response.json(destroyResponse)
  }
}
