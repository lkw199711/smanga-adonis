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
      include: { manga: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // orderBy: order_params(order),
    }

    const [list, count] = await Promise.all([
      prisma.collect.findMany(queryParams),
      prisma.collect.count({ where: queryParams.where }),
    ])

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list: list.map((item) => item.manga),
      count,
    })
    return response.json(listResponse)
  }

  public async chapters({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, pageSize } = request.only(['page', 'pageSize', 'order'])
    const quertParams = {
      where: { userId, collectType: 'chapter' },
      include: { chapter: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // orderBy: order_params(order),
    }

    const [list, count] = await Promise.all([
      prisma.collect.findMany(quertParams),
      prisma.collect.count({ where: quertParams.where }),
    ])

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list: list.map((item) => item.chapter),
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
        where: { mangaId: Number(mangaId), userId },
      })

      return response.json(new SResponse({ code: 0, message: '', data: !!collect }))
    }

    if (chapterId) {
      const collect = await prisma.collect.findFirst({
        where: { chapterId: Number(chapterId), userId },
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
