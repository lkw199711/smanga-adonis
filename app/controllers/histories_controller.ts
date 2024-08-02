import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

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
    const insertData: Prisma.historyCreateInput = request.only([
      'userid',
      'mediaId',
      'mangaId',
      'chapterId',
      'chapterName',
      'mangaName',
      'historyType',
    ])
    const history = await prisma.history.create({
      data: Object.assign(insertData, {  }),
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: history })
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
