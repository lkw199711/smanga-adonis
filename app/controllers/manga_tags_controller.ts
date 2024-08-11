/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-10 01:14:57
 * @FilePath: \smanga-adonis\app\controllers\manga_tags_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'

export default class MangaTagsController {
  public async index({ response }: HttpContext) {
    const list = await prisma.mangaTag.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { mangaTagId } = params
    mangaTagId = Number(mangaTagId)
    const mangaTag = await prisma.mangaTag.findUnique({ where: { mangaTagId } })
    const showResponse = new SResponse({ code: 0, message: '', data: mangaTag })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = request.only(['mangaId', 'tagId'])
    const mangaTag = await prisma.mangaTag.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: mangaTag })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { mangaTagId } = params
    mangaTagId = Number(mangaTagId)
    const modifyData = request.body()
    const mangaTag = await prisma.mangaTag.update({
      where: { mangaTagId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: mangaTag })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { mangaTagId } = params
    const mangaTag = await prisma.mangaTag.delete({ where: { mangaTagId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: mangaTag })
    return response.json(destroyResponse)
  }
}
