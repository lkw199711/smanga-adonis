/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-02-11 00:50:23
 * @FilePath: \smanga-adonis\app\controllers\latests_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'

export default class LatestsController {
  public async index({ request, response }: HttpContext) {
    const { userId } = request as any
    const list = await prisma.latest.findMany({
      where: {
        userId
      },
      include: { manga: true },
      orderBy: {
        updateTime: 'desc'
      },
      take: 10,
    })
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list: list.map((item) => item.manga),
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ request, params, response }: HttpContext) {
    const { userId } = request as any
    let { mangaId } = params
    const latest = await prisma.latest.findUnique({
      where: {
        mangaId_userId: {
          mangaId: Number(mangaId),
          userId,
        },
      },
    })
    const showResponse = new SResponse({ code: 0, message: '', data: latest })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, chapterId, mangaId, finish } = request.only([
      'page',
      'chapterId',
      'mangaId',
      'finish',
    ])
    const latest = await prisma.latest.upsert({
      where: {
        mangaId_userId: {
          mangaId,
          userId,
        },
      },
      update: { page, chapterId, mangaId, finish, userId },
      create: { page, chapterId, mangaId, finish, userId },
    })
    const saveResponse = new SResponse({ code: 0, message: '', data: latest })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { latestId } = params
    latestId = Number(latestId)
    const modifyData = request.only(['page', 'chapterId', 'finish'])
    const latest = await prisma.latest.update({
      where: { latestId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: latest })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { latestId } = params
    latestId = Number(latestId)
    const latest = await prisma.latest.delete({ where: { latestId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: latest })
    return response.json(destroyResponse)
  }
}
