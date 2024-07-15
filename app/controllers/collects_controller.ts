import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'

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
        const { collectType, userId, mediaId, mangaId, mangaName, chapterId, chapterName } = request.body()
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

    public async destroy({ params, response }: HttpContext) {
        let { collectId } = params
        collectId = Number(collectId)
        const collect = await prisma.collect.delete({ where: { collectId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: collect })
        return response.json(destroyResponse)
    }
}
