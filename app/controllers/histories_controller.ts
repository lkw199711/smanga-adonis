/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-10 02:20:54
 * @FilePath: \smanga-adonis\app\controllers\histories_controller.ts
 */

import type { HttpContext } from '@adonisjs/core/http'
import { ListResponse, SResponse } from '../interfaces/response.js'
import prisma from '#start/prisma'

export default class HistoriesController {
  public async index({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, pageSize } = request.only(['page', 'pageSize', 'order'])
    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      where: {
        userId,
      },
      include: {
        manga: {
          select: {
            mangaId: true,
            mangaName: true,
            mangaCover: true,
          },
        },
        chapter: {
          select: {
            chapterId: true,
            chapterName: true,
            chapterCover: true,
          },
        },
      },
    }
    const [list, count] = await Promise.all([
      prisma.history.findMany(queryParams),
      prisma.history.count({ where: queryParams.where }),
    ])

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list: list.map((item: any) => {
        return {
          ...item,
          ...item.manga,
          ...item.chapter,
        }
      }),
      count,
    })

    return response.json(listResponse)
  }

  public async create({ request, response }: HttpContext) {
    const {userId} = request as any
    const { mediaId, mangaId, chapterId, chapterName, mangaName } = request.only([
      'mediaId',
      'mangaId',
      'chapterId',
      'chapterName',
      'mangaName',
    ])
    
    const history = await prisma.history.create({
      data: {
        manga: {
          connect: {
            mangaId: Number(mangaId),
          },
        },
        chapter: {
          connect: {
            chapterId: Number(chapterId),
          },
        },
        user: {
          connect: {
            userId: Number(userId),
          },
        },
        mediaId: Number(mediaId),
        chapterName,
        mangaName,
      },
    })
    const saveResponse = new SResponse({ code: 0, message: '', data: history })
    return response.json(saveResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { historyId } = params
    historyId = Number(historyId)
    const history = await prisma.history.findUnique({ where: { historyId } })
    const showResponse = new SResponse({ code: 0, message: '', data: history })
    return response.json(showResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { historyId } = params
    historyId = Number(historyId)
    const modifyData = request.only(['mediaId', 'mangaId', 'chapterId', 'chapterName', 'mangaName'])
    const history = await prisma.history.update({
      where: { historyId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: history })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { historyId } = params
    historyId = Number(historyId)
    const history = await prisma.history.delete({ where: { historyId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: history })
    return response.json(destroyResponse)
  }
}
