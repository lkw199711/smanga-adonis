import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class MangaController {
  public async index({ response }: HttpContext) {
    const list = await prisma.manga.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { mangaId } = params
    mangaId = Number(mangaId)
    const manga = await prisma.manga.findUnique({
      where: { mangaId },
      include: {
        metas: true,
        manga_tags: {
          include: { tag: true },
        },
      },
    })

    // 处理返回的数据 将manga_tags中的tag提取出来
    const result = {
      ...manga,
      tags: manga?.manga_tags.map((manga_tag) => manga_tag.tag),
      manga_tags: undefined,
    }
    const showResponse = new SResponse({ code: 0, message: '', data: result })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = request.body() as Prisma.mangaCreateInput
    const manga = await prisma.manga.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: manga })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { mangaId } = params
    mangaId = Number(mangaId)
    const modifyData = request.body()
    const manga = await prisma.manga.update({
      where: { mangaId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: manga })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { mangaId } = params
    mangaId = Number(mangaId)
    const manga = await prisma.manga.delete({ where: { mangaId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: manga })
    return response.json(destroyResponse)
  }
}
