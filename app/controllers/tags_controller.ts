/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:22:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-05 22:35:43
 * @FilePath: \smanga-adonis\app\controllers\tags_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class TagsController {
  public async index({ request, response }: HttpContext) {
    const { page, pageSize } = request.only(['page', 'pageSize', 'order'])

    let listResponse = null
    if (page) {
      listResponse = await this.paginate(page, pageSize)
    } else {
      listResponse = await this.no_paginate()
    }

    return response.json(listResponse)
  }

  // 不分页
  private async no_paginate() {
    const list = await prisma.tag.findMany()

    return new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
  }

  // 分页
  private async paginate(page: number, pageSize: number) {
    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
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
    let { tagId } = params
    tagId = Number(tagId)
    const tag = await prisma.tag.findUnique({ where: { tagId } })
    const showResponse = new SResponse({ code: 0, message: '', data: tag })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = request.body() as Prisma.tagCreateInput
    const tag = await prisma.tag.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: tag })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { tagId } = params
    const modifyData = request.only(['tagName', 'description', 'tagColor'])
    const tag = await prisma.tag.update({
      where: { tagId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: tag })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { tagId } = params
    tagId = Number(tagId)
    // 删除关联数据
    await prisma.manga_tag.deleteMany({ where: { tagId } })
    const tag = await prisma.tag.delete({ where: { tagId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: tag })
    return response.json(destroyResponse)
  }

  public async manga_tags({ params, response }: HttpContext) {
    const { mangaId } = params
    const mangaTags = await prisma.manga_tag.findMany({
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
}
