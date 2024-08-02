import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'
export default class ChaptersController {
  public async index({ request, response }: HttpContext) {
    const { mangaId, page, pageSize } = request.only(['page', 'pageSize', 'limit', 'mangaId'])
    const queryParams = {
      skip: number_or_default(page, 0),
      take: number_or_default(pageSize, 10),
      where: {
        ...(mangaId && {
          mangaId: Number(mangaId),
        }),
      },
    }
    const list = await prisma.chapter.findMany(queryParams)
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { chapterId } = params
    chapterId = Number(chapterId)
    const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
    const showResponse = new SResponse({ code: 0, message: '', data: chapter })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = request.body() as Prisma.chapterCreateInput
    const chapter = await prisma.chapter.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: chapter })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { chapterId } = params
    chapterId = Number(chapterId)
    const modifyData = request.body()
    const chapter = await prisma.chapter.update({
      where: { chapterId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: chapter })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { chapterId } = params
    chapterId = Number(chapterId)
    const chapter = await prisma.chapter.delete({ where: { chapterId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: chapter })
    return response.json(destroyResponse)
  }
}

function number_or_default(value: string | undefined, defaultValue: number): number {
  return value ? Number(value) : defaultValue
}
