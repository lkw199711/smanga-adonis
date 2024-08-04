/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-04 19:03:54
 * @FilePath: \smanga-adonis\app\controllers\collects_controller.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
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
