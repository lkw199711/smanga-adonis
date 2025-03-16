/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-11 13:57:32
 * @FilePath: \smanga-adonis\app\controllers\bookmarks_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { compressImageToSize } from '../utils/sharp.js'
import { path_bookmark, get_config, s_delete } from '../utils/index.js'
export default class BookmarksController {
  public async index({ request, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId, page, pageSize } = request.only(['page', 'pageSize', 'chapterId', 'order'])

    let listResponse = null
    if (page) {
      listResponse = await this.paginate(userId, chapterId, page, pageSize)
    } else {
      listResponse = await this.no_paginate(userId, chapterId)
    }

    return response.json(listResponse)
  }

  // 不分页
  private async no_paginate(userId: number, chapterId: number) {
    const queryParams = {
      where: {
        ...(chapterId && { chapterId }),
        userId
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
  private async paginate(userId: number, chapterId: number, page: number, pageSize: number) {
    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      where: {
        ...(chapterId && { chapterId }),
        userId
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

    for (let i = 0; i < list.length; i++) {
      const chapter: any = list[i];
      const chapterId = Number(chapter.chapterId);
      if (chapterId) {
        chapter.latest = await prisma.latest.findFirst({
          where: { userId, chapterId },
        })
        chapter.latest.page = chapter.page
      } else {
        chapter.latest = null
      }
    }

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

  public async create({ request, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId, mangaId, mediaId, browseType, page, pageImage } = request.only([
      'chapterId',
      'mangaId',
      'mediaId',
      'browseType',
      'page',
      'pageImage',
    ])

    // 复制书签图片
    let outputFile = ''
    if (pageImage) {
      const bookmarkPath = path_bookmark()
      const config = get_config()
      outputFile = `${bookmarkPath}/smanga_bookmark_${chapterId}.jpg`
      await compressImageToSize(pageImage, outputFile, config.compress.bookmark)
    }

    const bookmark = await prisma.bookmark.create({
      data: {
        chapterId,
        mangaId,
        mediaId,
        browseType,
        page,
        pageImage: outputFile,
        userId,
      },
    })

    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: bookmark })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { bookmarkId } = params
    bookmarkId = Number(bookmarkId)
    const modifyData = request.only(['chapterId', 'mangaId', 'mediaId', 'browseType', 'page', 'pageImage'])
    const bookmark = await prisma.bookmark.update({
      where: { bookmarkId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: bookmark })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { bookmarkId } = params
    const bookmark = await prisma.bookmark.findFirst({ where: { bookmarkId } })
    if (!bookmark) {
      return response.json(new SResponse({ code: 1, message: '书签不存在' }))
    }

    // 删除书签文件
    if (bookmark.pageImage && /smanga_bookmark/.test(bookmark.pageImage)) {
      s_delete(bookmark.pageImage)
    }

    const bookmarkDelete = await prisma.bookmark.delete({ where: { bookmarkId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: bookmarkDelete })
    return response.json(destroyResponse)
  }
}
