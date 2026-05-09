import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { Prisma } from '@prisma/client'
import { ListResponse, SResponse } from '../interfaces/response.js'
import _ from 'lodash'
import {
  listTagValidator,
  idParamTagValidator,
  createTagValidator,
  updateTagValidator,
  batchIdsParamTagValidator,
  mangaIdParamValidator,
  tagsMangaQueryValidator,
} from '#validators/tag'
import { csvToPositiveIds } from '#validators/shared'

export default class TagsController {
  public async index({ request, response }: HttpContext) {
    const { page, pageSize } = await listTagValidator.validate(request.qs())

    let listResponse = null
    if (page) {
      listResponse = await this.paginate(page, pageSize ?? 10)
    } else {
      listResponse = await this.no_paginate({ request, response })
    }

    return response.json(listResponse)
  }

  // 不分页
  private async no_paginate({ request, response }: any) {
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
    const mediaIds = mediaPermissons.map((item: any) => item.mediaId)

    const tagList: any[] = await prisma.$queryRaw`SELECT 
          tag.tagId,
          MAX(tag.tagName) AS tagName,
          MAX(tag.tagColor) AS tagColor,
          MAX(tag.description) AS description,
          MAX(tag.updateTime) AS updateTime,
          MAX(tag.createTime) AS createTime,
          MAX(manga.mangaId) AS mangaId,
          MAX(manga.mediaId) AS mediaId,
          COUNT(history.historyId) AS "readCount"
      FROM 
          tag
      JOIN 
          mangaTag ON tag.tagId = mangaTag.tagId
      JOIN 
          manga ON mangaTag.mangaId = manga.mangaId
      LEFT JOIN 
          history ON manga.mangaId = history.mangaId
      WHERE 
          ${isAdmin} OR manga.mediaId IN (${Prisma.join(mediaIds)})
      GROUP BY 
          tag.tagId
      ORDER BY 
          COUNT(history.historyId) DESC
      `

    return new ListResponse({
      code: 0,
      message: '',
      list: tagList,
      count: tagList.length,
    })
  }

  // 分页
  private async paginate(page: number, pageSize: number) {
    const queryParams = {
      skip: (page - 1) * pageSize,
      take: pageSize,
      where: {},
    }

    const [list, count] = await Promise.all([
      prisma.tag.findMany(queryParams),
      prisma.tag.count({ where: queryParams.where }),
    ])

    return new ListResponse({
      code: 0,
      message: '',
      list,
      count: count,
    })
  }

  public async show({ params, response }: HttpContext) {
    const { tagId } = await idParamTagValidator.validate(params)
    const tag = await prisma.tag.findUnique({ where: { tagId } })
    const showResponse = new SResponse({ code: 0, message: '', data: tag })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const { userId } = request as any
    const insertData = await createTagValidator.validate(request.all())
    const tag = await prisma.tag.create({
      data: { ...insertData, userId },
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: tag })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { tagId } = await idParamTagValidator.validate(params)
    const modifyData = await updateTagValidator.validate(request.all())
    const tag = await prisma.tag.update({
      where: { tagId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: tag })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    const { tagId } = await idParamTagValidator.validate(params)
    // 删除关联数据
    await prisma.mangaTag.deleteMany({ where: { tagId } })
    const tag = await prisma.tag.delete({ where: { tagId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: tag })
    return response.json(destroyResponse)
  }

  // 批量删除
  public async destroy_batch({ params, response }: HttpContext) {
    const { tagIds } = await batchIdsParamTagValidator.validate(params)
    // 删除关联数据
    await prisma.mangaTag.deleteMany({
      where: { tagId: { in: tagIds } },
    })
    const deleteResponse = await prisma.tag.deleteMany({
      where: { tagId: { in: tagIds } },
    })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: deleteResponse })
    return response.json(destroyResponse)
  }

  public async manga_tags({ params, response }: HttpContext) {
    const { mangaId } = await mangaIdParamValidator.validate(params)
    const mangaTags = await prisma.mangaTag.findMany({
      where: { mangaId },
      include: {
        tag: true,
      },
    })

    const list = mangaTags.map((item) => Object.assign(item.tag, { mangaTagId: item.mangaTagId }))

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })

    return response.json(listResponse)
  }

  public async tags_manga({ request, response }: HttpContext) {
    const query = await tagsMangaQueryValidator.validate(request.qs())
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 10

    // tagIds 支持 CSV 字符串或数组,统一走 shared 工具转正整数数组
    const tagIds = csvToPositiveIds(query.tagIds)
    if (!tagIds.length) {
      return response.status(400).json(new SResponse({ code: 400, message: 'tagIds不能为空' }))
    }

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

    const mangaTags = await prisma.mangaTag.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      where: {
        tagId: { in: tagIds },
        manga: {
          deleteFlag: 0,
          ...(!isAdmin && { mediaId: { in: mediaPermissons.map((item: any) => item.mediaId) } }),
        },
      },
      include: {
        manga: true,
      },
    })

    // 去重
    const uniqueMangaTags = _.uniqBy(mangaTags, 'mangaId')
    const list = uniqueMangaTags.map((item) => Object.assign(item.manga, { mangaTagId: item.mangaTagId }))

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })

    return response.json(listResponse)
  }
}
