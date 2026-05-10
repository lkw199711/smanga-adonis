import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { Prisma } from '@prisma/client'
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
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  public async index({ request, response }: HttpContext) {
    const { page, pageSize } = await listTagValidator.validate(request.qs())

    if (page) {
      return response.json(await this.paginate(page, pageSize ?? 10))
    }
    return await this.no_paginate({ request, response })
  }

  // 不分页
  private async no_paginate({ request, response }: any) {
    const userId = (request as any).userId
    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return response
        .status(401)
        .json({ code: 401, message: '用户不存在', status: 'token error' })
    }
    const isAdmin = user.role === 'admin' || user.mediaPermit === 'all'
    const mediaPermissons =
      (await prisma.mediaPermisson.findMany({
        where: { userId },
        select: { mediaId: true },
      })) || []
    const mediaIds = mediaPermissons.map((item: any) => item.mediaId)

    // 非管理员且无媒体库权限时返回空列表
    if (!isAdmin && mediaIds.length === 0) {
      return response.json({ code: 200, message: '', list: [], count: 0 })
    }

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

    return response.json({ code: 200, message: '', list: tagList, count: tagList.length })
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

    return { code: 200, message: '', list, count }
  }

  public async show({ params, response }: HttpContext) {
    const { tagId } = await idParamTagValidator.validate(params)
    const tag = await prisma.tag.findUnique({ where: { tagId } })
    return response.json({ code: 200, message: '', data: tag })
  }

  public async create({ request, response }: HttpContext) {
    const { userId } = request as any
    const insertData = await createTagValidator.validate(request.all())
    const tag = await prisma.tag.create({
      data: { ...insertData, userId },
    })
    return response.json({ code: 200, message: '新增成功', data: tag })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { tagId } = await idParamTagValidator.validate(params)
    const modifyData = await updateTagValidator.validate(request.all())
    const tag = await prisma.tag.update({
      where: { tagId },
      data: modifyData,
    })
    return response.json({ code: 200, message: '更新成功', data: tag })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { tagId } = await idParamTagValidator.validate(params)
    // 删除关联数据
    await prisma.mangaTag.deleteMany({ where: { tagId } })
    const tag = await prisma.tag.delete({ where: { tagId } })
    return response.json({ code: 200, message: '删除成功', data: tag })
  }

  // 批量删除
  public async destroy_batch({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { tagIds } = await batchIdsParamTagValidator.validate(params)
    // 删除关联数据
    await prisma.mangaTag.deleteMany({
      where: { tagId: { in: tagIds } },
    })
    const deleteResponse = await prisma.tag.deleteMany({
      where: { tagId: { in: tagIds } },
    })
    return response.json({ code: 200, message: '删除成功', data: deleteResponse })
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

    return response.json({ code: 200, message: '', list, count: list.length })
  }

  public async tags_manga({ request, response }: HttpContext) {
    const query = await tagsMangaQueryValidator.validate(request.qs())
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 10

    // tagIds 支持 CSV 字符串或数组,统一走 shared 工具转正整数数组
    const tagIds = csvToPositiveIds(query.tagIds)
    if (!tagIds.length) {
      return response.status(400).json({ code: 400, message: 'tagIds不能为空' })
    }

    const userId = (request as any).userId
    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return response
        .status(401)
        .json({ code: 401, message: '用户不存在', status: 'token error' })
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

    return response.json({ code: 200, message: '', list, count: list.length })
  }
}
