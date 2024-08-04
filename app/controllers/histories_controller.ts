/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-04 02:39:11
 * @FilePath: \smanga-adonis\app\controllers\histories_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'

export default class HistoriesController {
  public async index({ response }: HttpContext) {
    const list = await prisma.history.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async create({ request, response }: HttpContext) {
    const { userId, mediaId, mangaId, chapterId, chapterName, mangaName } = request.only([
      'userId',
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
    const modifyData = request.body()
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
