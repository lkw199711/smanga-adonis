/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-07 00:40:05
 * @FilePath: \smanga-adonis\app\controllers\bookmarks_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import type { HttpContextWithUserId } from '#type/http.js'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
export default class BookmarksController {
  public async index({ request, response }: HttpContext) {
    const { chapterId, page, pageSize } = request.only(['page', 'pageSize', 'chapterId', 'order'])

    let listResponse = null
    if (page) {
      listResponse = await this.paginate(chapterId, page, pageSize)
    } else {
      listResponse = await this.no_paginate(chapterId)
    }

    return response.json(listResponse)
  }

  // 不分页
  private async no_paginate(chapterId: number) {
    const queryParams = {
      where: {
        ...(chapterId && { chapterId }),
      },
    }

    const list = await prisma.bookmark.findMany(queryParams)

    return new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
  }

  // 分页
  private async paginate(chapterId: number, page: number, pageSize: number) {
    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      where: {
        ...(chapterId && { chapterId }),
      },
      include: {
        chapter: {
          select: {
            chapterName: true,
          },
        },
        manga: {
          select: {
            mangaName: true,
          },
        },
      },
    }

    const [list, count] = await Promise.all([
      prisma.bookmark.findMany(queryParams),
      prisma.bookmark.count({ where: queryParams.where }),
    ])

    return new ListResponse({
      code: 0,
      message: '',
      list: list.map((item) => ({
        ...item,
        chapterName: item.chapter.chapterName,
        mangaName: item.manga.mangaName,
      })),
      count: count,
    })
  }

  public async show({ params, response }: HttpContext) {
    let { bookmarkId } = params
    bookmarkId = Number(bookmarkId)
    const bookmark = await prisma.bookmark.findUnique({ where: { bookmarkId } })
    const showResponse = new SResponse({ code: 0, message: '', data: bookmark })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContextWithUserId) {
    const insertData = request.only([
      'chapterId',
      'mangaId',
      'mediaId',
      'browseType',
      'page',
      'pageImage',
    ])
    const bookmark = await prisma.bookmark.create({
      data: { ...insertData, userId: request.userId },
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
