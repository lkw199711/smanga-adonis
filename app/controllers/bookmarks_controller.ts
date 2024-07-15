import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'
export default class BookmarksController {
  public async index({ response }: HttpContext) { 
    const list = await prisma.bookmark.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) { 
    let { bookmarkId } = params
    bookmarkId = Number(bookmarkId)
    const bookmark = await prisma.bookmark.findUnique({ where: { bookmarkId } })
    const showResponse = new SResponse({ code: 0, message: '', data: bookmark })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) { 
    const insertData = request.body() as Prisma.bookmarkCreateInput;
    const bookmark = await prisma.bookmark.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: bookmark })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) { 
    let { bookmarkId } = params
    bookmarkId = Number(bookmarkId)
    const modifyData = request.body()
    const bookmark = await prisma.bookmark.update({
      where: { bookmarkId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: bookmark })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) { 
    let { bookmarkId } = params
    bookmarkId = Number(bookmarkId)
    const bookmark = await prisma.bookmark.delete({ where: { bookmarkId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: bookmark })
    return response.json(destroyResponse)
  }
}