import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { Prisma } from '@prisma/client'
import { TaskPriority } from '../type/index.js'
import { scanQueue } from '#services/queue_service'

export default class MangaController {
  public async index({ request, response }: HttpContext) {
    const { mediaId, page, pageSize } = request.only([
      'mediaId',
      'page',
      'pageSize',
      'chapterId',
      'order',
    ])

    const userId = (request as any).userId
    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return response
        .status(401)
        .json(new SResponse({ code: 401, message: '用户不存在', status: 'token error' }))
    }
    const isAdmin = user.role === 'admin' || user.mediaPermit === 'all'
    const mediaPermissons =
      (await prisma.mediaPermisson.findMany({
        where: { userId },
        select: { mediaId: true },
      })) || []

    let listResponse = null
    if (page) {
      listResponse = await this.paginate({ mediaId, page, pageSize, isAdmin, mediaPermissons })
    } else {
      listResponse = await this.no_paginate({ mediaId, isAdmin, mediaPermissons })
    }

    return response.json(listResponse)
  }

  // 不分页
  private async no_paginate({ mediaId, isAdmin, mediaPermissons }: any) {
    const queryParams = {
      where: {
        ...(mediaId && { mediaId }),
        deleteFlag: 0,
        ...(!isAdmin && { mediaId: { in: mediaPermissons.map((item: any) => item.media) } }),
      },
    }

    const list = await prisma.manga.findMany(queryParams)

    return new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
  }

  // 分页
  private async paginate({ mediaId, page, pageSize, isAdmin, mediaPermissons }: any) {
    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      where: {
        ...(mediaId && { mediaId }),
        deleteFlag: 0,
        ...(!isAdmin && { mediaId: { in: mediaPermissons.map((item: any) => item.media) } }),
      },
    }

    const [list, count] = await Promise.all([
      prisma.manga.findMany(queryParams),
      prisma.manga.count({ where: queryParams.where }),
    ])

    return new ListResponse({
      code: 0,
      message: '',
      list,
      count: count,
    })
  }

  public async show({ params, response }: HttpContext) {
    let { mangaId } = params
    mangaId = Number(mangaId)
    const manga = await prisma.manga.findUnique({
      where: { mangaId },
      include: {
        metas: true,
        mangaTags: {
          include: { tag: true },
        },
      },
    })

    // 处理返回的数据 将mangaTags中的tag提取出来
    const result = {
      ...manga,
      tags: manga?.mangaTags.map((mangaTag) => mangaTag.tag),
      mangaTags: undefined,
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
    const modifyData = request.only([
      'mangaName',
      'mangaNumber',
      'mangaPath',
      'mangaCover',
      'removeFirst',
      'browseType',
    ])
    const manga = await prisma.manga.update({
      where: { mangaId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: manga })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { mangaId } = params
    const manga = await prisma.manga.update({ where: { mangaId }, data: { deleteFlag: 1 } })

    // await delete_manga_job({ mangaId: manga.mangaId })

    scanQueue.add({
      taskName: `delete_manga_${manga.mangaId}`,
      command: 'deleteManga',
      args: { mangaId: manga.mangaId }
    }, {
      priority: TaskPriority.deleteManga,
      timeout: 1000 * 60 * 1,
    })

    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: manga })
    return response.json(destroyResponse)
  }
}
