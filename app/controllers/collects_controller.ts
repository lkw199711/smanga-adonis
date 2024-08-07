/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-07 20:51:12
 * @FilePath: \smanga-adonis\app\controllers\collects_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import type { HttpContextWithUserId } from '#type/http.js'
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

  public async mangas({ request, response }: HttpContextWithUserId) {
    const { userId } = request
    const quertParams = {
      where: { userId, collectType: 'manga' },
    }

    const [list, count] = await Promise.all([
      prisma.collect.findMany(quertParams),
      prisma.collect.count(quertParams),
    ])

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })
    return response.json(listResponse)
  }

  public async chapters({ request, response }: HttpContextWithUserId) {
    const { userId } = request
    const quertParams = {
      where: { userId, collectType: 'chapter' },
    }

    const [list, count] = await Promise.all([
      prisma.collect.findMany(quertParams),
      prisma.collect.count(quertParams),
    ])

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })
    return response.json(listResponse)
  }

  public async collect_manga({ request, response }: HttpContextWithUserId) {
    const { userId } = request
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
      const destroy = await prisma.collect.delete({ where: { collectId: collect.collectId } })
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

  public async is_collect({ params, response }: HttpContext) {
    const { mangaId, chapterId } = params

    if (mangaId) {
      const collect = await prisma.collect.findFirst({
        where: { mangaId: Number(mangaId), userId: 1 },
      })

      return response.json(new SResponse({ code: 0, message: '', data: !!collect }))
    }

    if (chapterId) {
      const collect = await prisma.collect.findFirst({
        where: { chapterId: Number(chapterId), userId: 1 },
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
