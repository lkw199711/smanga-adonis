/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-08 21:29:33
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-16 16:08:55
 * @FilePath: \smanga-adonis\app\controllers\searches_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { order_params } from '../utils/index.js'

export default class SearchesController {
  public async mangas({ request, response }: HttpContext) {
    const { searchText, page, pageSize, order } = request.only([
      'searchText',
      'searchType',
      'page',
      'pageSize',
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

    const quertParams = {
      where: {
        subTitle: {
          contains: searchText,
        },
        ...(!isAdmin && { mediaId: { in: mediaPermissons.map((item) => item.mediaId) } }),
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: order_params(order, 'manga'),
    }

    const [list, count] = await Promise.all([
      prisma.manga.findMany(quertParams),
      prisma.manga.count({ where: quertParams.where }),
    ])

    // 统计未观看章节数
    for (let i = 0; i < list.length; i++) {
      const manga: any = list[i];
      const mangaId = Number(manga.mangaId);
      const chapterCount = await prisma.chapter.count({ where: { mangaId } })
      const historys = await prisma.history.groupBy({
        by: ['chapterId'],
        where: { mangaId, userId },
      })

      manga.unWatched = chapterCount - historys.length
    }

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })
    return response.json(listResponse)
  }

  public async chapters({ request, response }: HttpContext) {
    const { searchText, page, pageSize, order } = request.only([
      'searchText',
      'page',
      'pageSize',
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

    const quertParams = {
      where: {
        subTitle: {
          contains: searchText,
        },
        ...(!isAdmin && { mediaId: { in: mediaPermissons.map((item) => item.mediaId) } }),
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: order_params(order, 'chapter'),
    }

    const [list, count] = await Promise.all([
      prisma.chapter.findMany(quertParams),
      prisma.chapter.count({ where: quertParams.where }),
    ])

    for (let i = 0; i < list.length; i++) {
      const chapter: any = list[i];
      const chapterId = Number(chapter.chapterId);
      if (chapterId) {
        chapter.latest = await prisma.latest.findFirst({
          where: { userId, chapterId },
        })
      } else {
        chapter.latest = null
      }
    }

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })

    return response.json(listResponse)
  }
}
