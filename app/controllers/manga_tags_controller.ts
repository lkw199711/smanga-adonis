import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import {
  idParamMangaTagValidator,
  createMangaTagValidator,
  updateMangaTagValidator,
} from '#validators/manga_tag'

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
    const { mangaTagId } = await idParamMangaTagValidator.validate(params)
    const mangaTag = await prisma.mangaTag.findUnique({ where: { mangaTagId } })
    const showResponse = new SResponse({ code: 0, message: '', data: mangaTag })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = await createMangaTagValidator.validate(request.all())
    const mangaTag = await prisma.mangaTag.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: mangaTag })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { mangaTagId } = await idParamMangaTagValidator.validate(params)
    const modifyData = await updateMangaTagValidator.validate(request.all())
    const mangaTag = await prisma.mangaTag.update({
      where: { mangaTagId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: mangaTag })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    const { mangaTagId } = await idParamMangaTagValidator.validate(params)
    const mangaTag = await prisma.mangaTag.delete({ where: { mangaTagId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: mangaTag })
    return response.json(destroyResponse)
  }
}
