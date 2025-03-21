import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '#interfaces/response'
import { Prisma } from '@prisma/client'
import { TaskPriority } from '#type/index'
import { addTask } from '#services/queue_service'

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

    if (!isAdmin) {
      // 非管理员权限
      const mediaIds = mediaPermissons.map((item: any) => item.mediaId)
      if (!mediaIds.includes(Number(mediaId))) {
        return response
          .status(401)
          .json(new SResponse({ code: 401, message: '无权限操作', status: 'permisson error' }))
      }
    }

    let listResponse = null
    if (page) {
      listResponse = await this.paginate({ mediaId, page, pageSize, userId })
    } else {
      listResponse = await this.no_paginate({ mediaId })
    }

    return response.json(listResponse)
  }

  // 不分页
  private async no_paginate({ mediaId }: any) {
    const queryParams = {
      where: {
        ...(mediaId && { mediaId }),
        deleteFlag: 0,
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
  private async paginate({ mediaId, page, pageSize, userId }: any) {

    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      where: {
        ...(mediaId && { mediaId }),
        deleteFlag: 0,
      },
      orderBy: {
        updateTime: 'desc',
      },
    }

    const [list, count] = await Promise.all([
      prisma.manga.findMany(queryParams),
      prisma.manga.count({ where: queryParams.where }),
    ])

    // 统计未观看章节数
    for (let i = 0; i < list.length; i++) {
      const manga: any = list[i];
      const chapterCount = await prisma.chapter.count({ where: { mangaId: manga.mangaId } })
      const historys = await prisma.history.groupBy({
        by: ['chapterId'],
        where: { mangaId: manga.mangaId, userId },
      })

      manga.unWatched = chapterCount - historys.length
    }

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

    addTask({
      taskName: `delete_manga_${manga.mangaId}`,
      command: 'deleteManga',
      args: { mangaId: manga.mangaId },
      priority: TaskPriority.deleteManga,
      timeout: 1000 * 60 * 10,
    })

    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: manga })
    return response.json(destroyResponse)
  }

  public async scan({ params, response }: HttpContext) { 
    let { mangaId } = params
    const manga = await prisma.manga.findUnique({ where: { mangaId } })
    if (!manga) {
      return response
        .status(404)
        .json(new SResponse({ code: 404, message: '漫画不存在', status: 'not found' }))
    }

    const path = await prisma.path.findUnique({ where: { pathId: manga.pathId } })
    const media = await prisma.media.findUnique({ where: { mediaId: manga.mediaId } })

    if (!path) { 
      return response
        .status(404)
        .json(new SResponse({ code: 404, message: '路径不存在', status: 'not found' }))
    }

    addTask({
      taskName: `scan_manga_${manga.mangaId}`,
      command: 'taskScanManga',
      args: {
        pathId: path.pathId,
        pathInfo: path,
        mediaInfo: media,
        mangaPath: manga.mangaPath,
        mangaName: manga.mangaName,
        mangaId: manga.mangaId
      },
      priority: TaskPriority.scanManga,
      timeout: 1000 * 60 * 60 * 2,
    })

    const scanResponse = new SResponse({ code: 0, message: '扫描任务添加成功', data: manga })
    return response.json(scanResponse)
  }
}
