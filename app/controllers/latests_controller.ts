/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-03-15 02:16:16
 * @FilePath: \smanga-adonis\app\controllers\latests_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'

export default class LatestsController {
  public async index({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, pageSize } = request.only(['page', 'pageSize', 'order'])
    const list: any = await prisma.$queryRaw`SELECT 
          latest.mangaId,
          MAX(latest.chapterId) AS chapterId,  -- 使用聚合函数选择 chapterId
          MAX(latest.mangaId) AS mangaId,  -- 使用聚合函数选择 mangaId
          MAX(latest.userId) AS userId,          -- 使用聚合函数选择 userId
          MAX(manga.mangaName) AS mangaName, -- 使用聚合函数选择 mangaName
          MAX(manga.mangaCover) AS mangaCover,   -- 使用聚合函数选择 mangaCover
          MAX(manga.browseType) AS browseType      -- 使用聚合函数选择 browseType
      FROM 
          latest
      JOIN 
          manga ON latest.mangaId = manga.mangaId
      WHERE 
          latest.userId = ${userId}
      GROUP BY 
          latest.mangaId
      ORDER BY 
          MAX(latest.updateTime) DESC  -- 根据 updateTime 排序
      LIMIT 
          ${pageSize ? pageSize : 10};
      `;

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list?.length,
    })
    return response.json(listResponse)
  }

  public async show({ request, params, response }: HttpContext) {
    const { userId } = request as any
    let { mangaId } = params
    const latest = await prisma.latest.findFirst({
      where: {
        userId,
        mangaId,
      },
      orderBy: {
        updateTime: 'desc',
      },
    })
    const showResponse = new SResponse({ code: 0, message: '', data: latest })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, count, chapterId, mangaId, finish } = request.only([
      'page',
      'count',
      'chapterId',
      'mangaId',
      'finish',
    ])
    const latest = await prisma.latest.upsert({
      where: {
        chapterId_userId: {
          chapterId,
          userId,
        },
      },
      update: { page, count, chapterId, mangaId, finish, userId },
      create: { page, count, chapterId, mangaId, finish, userId },
    })
    const saveResponse = new SResponse({ code: 0, message: '', data: latest })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId } = params
    const modifyData = request.only(['page', 'chapterId', 'finish'])
    const latest = await prisma.latest.updateMany({
      where: { chapterId, userId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: latest })
    return response.json(updateResponse)
  }

  public async destroy({ request, params, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId } = params
    const latest = await prisma.latest.deleteMany({ where: { chapterId, userId } })
    const destroyResponse = new SResponse({ code: 0, message: '', data: latest })
    return response.json(destroyResponse)
  }
}
