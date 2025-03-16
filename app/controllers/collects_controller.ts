/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-10 02:18:43
 * @FilePath: \smanga-adonis\app\controllers\collects_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'

export default class CollectsController {
  public async index({ response }: HttpContext) {
    const collect = await prisma.collect.findMany()
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
    const { page, pageSize } = request.only(['page', 'pageSize', 'order'])
    const queryParams = {
      where: { userId, collectType: 'manga' },
      include: {
        manga: {
          select: {
            mangaId: true,
            mangaName: true,
            mangaCover: true,
            mediaId: true,
            browseType: true,
            removeFirst: true,
            describe: true
          },
        }
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // orderBy: order_params(order),
    }

    const [list, count] = await Promise.all([
      prisma.collect.findMany(queryParams),
      prisma.collect.count({ where: queryParams.where }),
    ])

    // 统计未观看章节数
    for (let i = 0; i < list.length; i++) {
      const manga: any = list[i];
      const mangaId = Number(manga.mangaId);
      const chapterCount = await prisma.chapter.count({ where: { mangaId } })
      const historys = await prisma.history.groupBy({
        by: ['chapterId'],
        where: { mangaId, userId },
      })

      manga.unWatched = chapterCount - historys.length
    }

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list: list.map((item) => {
        return {
          ...item,
          ...item.manga
        }
      }),
      count,
    })
    return response.json(listResponse)
  }

  public async chapters({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, pageSize } = request.only(['page', 'pageSize', 'order'])
    const quertParams = {
      where: { userId, collectType: 'chapter' },
      include: {
        chapter: {
          select: {
            chapterId: true,
            chapterName: true,
            chapterCover: true,
          }
        },
        manga: {
          select: {
            mediaId: true,
            mangaId: true,
            browseType: true,
            removeFirst: true,
            describe: true
          },
        }
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // orderBy: order_params(order),
    }

    const [list, count] = await Promise.all([
      prisma.collect.findMany(quertParams),
      prisma.collect.count({ where: quertParams.where }),
    ])

    for (let i = 0; i < list.length; i++) {
      const chapter: any = list[i];
      const chapterId = Number(chapter.chapterId);
      if (chapterId) {
        chapter.latest = await prisma.latest.findFirst({
          where: { userId, chapterId },
        })
      } else {
        chapter.latest = null
      }
    }

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

  public async collect_manga({ request, response }: HttpContext) {
    const { userId } = request as any
    const { mangaId, mangaName, mediaId } = request.only([
      'mangaId',
      'mangaName',
      'mediaId',
      'collectType',
    ])

    const collect = await prisma.collect.findFirst({
      where: { userId, mangaId: mangaId, collectType: 'manga' },
    })

    if (collect) {
      await prisma.collect.delete({ where: { collectId: collect.collectId } })
      const destroyResponse = new SResponse({ code: 0, message: '取消收藏成功', data: false })
      return response.json(destroyResponse)
    } else {
      const collect = await prisma.collect.create({
        data: {
          collectType: 'manga',
          userId,
          mediaId,
          mangaId,
          mangaName,
        },
      })

      const saveResponse = new SResponse({ code: 0, message: '收藏成功', data: collect })
      return response.json(saveResponse)
    }
  }

  public async collect_chapter({ request, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId, chapterName, mediaId, mangaId, mangaName } = request.only([
      'chapterId',
      'chapterName',
      'mediaId',
      'mangaId',
      'mangaName',
      'collectType',
    ])

    const collect = await prisma.collect.findFirst({
      where: { userId, chapterId: chapterId, collectType: 'chapter' },
    })

    if (collect) {
      const destroyResponse = new SResponse({ code: 0, message: '取消收藏成功', data: false })
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
        },
      })

      const saveResponse = new SResponse({ code: 0, message: '收藏成功', data: collect })
      return response.json(saveResponse)
    }
  }

  public async create({ request, response }: HttpContext) {
    const { collectType, userId, mediaId, mangaId, mangaName, chapterId, chapterName } =
      request.body()
    const collect = await prisma.collect.create({
      data: {
        collectType,
        userId,
        mediaId,
        mangaId,
        mangaName,
        chapterId,
        chapterName,
      },
    })

    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: collect })
    return response.json(saveResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { collectId } = params
    collectId = Number(collectId)
    const collect = await prisma.collect.findUnique({ where: { collectId } })
    const showResponse = new SResponse({ code: 0, message: '', data: collect })
    return response.json(showResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { collectId } = params
    collectId = Number(collectId)
    const { collectType, userId, mediaId, mangaId, mangaName, chapterId, chapterName } =
      request.body()
    const collect = await prisma.collect.update({
      where: { collectId },
      data: {
        collectType,
        userId,
        mediaId,
        mangaId,
        mangaName,
        chapterId,
        chapterName,
      },
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: collect })
    return response.json(updateResponse)
  }

  public async is_collect({ request, params, response }: HttpContext) {
    const { userId } = request as any
    const { mangaId, chapterId } = params

    if (mangaId) {
      const collect = await prisma.collect.findFirst({
        where: { mangaId, chapterId: null, userId },
      })

      return response.json(new SResponse({ code: 0, message: '', data: !!collect }))
    }

    if (chapterId) {
      const collect = await prisma.collect.findFirst({
        where: { chapterId: chapterId, userId },
      })

      return response.json(new SResponse({ code: 0, message: '', data: !!collect }))
    }
  }

  public async destroy({ params, response }: HttpContext) {
    let { collectId } = params
    collectId = Number(collectId)
    const collect = await prisma.collect.delete({ where: { collectId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: collect })
    return response.json(destroyResponse)
  }
}
