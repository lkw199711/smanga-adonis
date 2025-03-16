/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-03-15 01:53:30
 * @FilePath: \smanga-adonis\app\controllers\histories_controller.ts
 */

import type { HttpContext } from '@adonisjs/core/http'
import { ListResponse, SResponse } from '../interfaces/response.js'
import prisma from '#start/prisma'

export default class HistoriesController {
  public async index({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, pageSize } = request.only(['page', 'pageSize', 'order'])
    const [list, distinct] = await Promise.all([
      prisma.$queryRaw`SELECT 
          history.mangaId,
          MAX(history.chapterId) AS chapterId,  -- 使用聚合函数选择 chapterId
          MAX(history.userId) AS userId,          -- 使用聚合函数选择 userId
          MAX(chapter.chapterName) AS chapterName, -- 使用聚合函数选择 chapterName
          MAX(manga.mangaCover) AS chapterCover,   -- 使用聚合函数选择 mangaCover
          MAX(manga.browseType) AS browseType      -- 使用聚合函数选择 browseType
      FROM 
          history
      JOIN 
          manga ON history.mangaId = manga.mangaId
      JOIN 
          chapter ON history.chapterId = chapter.chapterId
      WHERE 
          history.userId = ${userId}
      GROUP BY 
          history.mangaId
      ORDER BY 
          MAX(history.createTime) DESC  -- 根据 createTime 排序
      LIMIT
        ${pageSize} 
      OFFSET
        ${(page - 1) * pageSize}
      `,
      prisma.$queryRaw`SELECT COUNT(DISTINCT mangaId) AS count FROM history WHERE userId = ${userId}`,
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
      count: Number((distinct as any)[0].count),
    })

    return response.json(listResponse)

    /** 之前的查询语句
     * // groupBy模式
    await prisma.$queryRaw`SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''));`
     * prisma.history.groupBy(queryParams),
      prisma.$queryRaw`SELECT history.mangaId,history.chapterId,history.userId,chapter.chapterName,manga.mangaCover AS chapterCover,manga.browseType FROM history,manga,chapter
        WHERE history.mangaId = manga.mangaId AND history.chapterId = chapter.chapterId AND history.userId = ${userId}  
        GROUP BY history.mangaId
        ORDER BY history.createTime DESC
        LIMIT ${page ? pageSize : 100}`,
     */
  }

  public async create({ request, response }: HttpContext) {
    const { userId } = request as any
    const { mediaId, mangaId, chapterId, chapterName, mangaName } = request.only([
      'mediaId',
      'mangaId',
      'chapterId',
      'chapterName',
      'mangaName',
    ])

    const history = await prisma.history.create({
      data: {
        manga: {
          connect: {
            mangaId: Number(mangaId),
          },
        },
        chapter: {
          connect: {
            chapterId: Number(chapterId),
          },
        },
        user: {
          connect: {
            userId: Number(userId),
          },
        },
        mediaId: Number(mediaId),
        chapterName,
        mangaName,
      },
    })
    const saveResponse = new SResponse({ code: 0, message: '', data: history })
    return response.json(saveResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { historyId } = params
    historyId = Number(historyId)
    const history = await prisma.history.findUnique({ where: { historyId } })
    const showResponse = new SResponse({ code: 0, message: '', data: history })
    return response.json(showResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId } = params
    const modifyData = request.only(['mediaId', 'mangaId', 'chapterId', 'chapterName', 'mangaName'])
    const history = await prisma.history.updateMany({
      where: { chapterId, userId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: history })
    return response.json(updateResponse)
  }

  public async destroy({ request, params, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId } = params
    const data = await prisma.history.deleteMany({ where: { chapterId, userId } })
    const destroyResponse = new SResponse({ code: 0, message: '', data })
    return response.json(destroyResponse)
  }

  public async read_all_chapters({ request, params, response }: HttpContext) {
    const { userId } = request as any
    const { mangaId } = params
    const chapters = await prisma.chapter.findMany({ where: { mangaId } })
    chapters.forEach(async (chapter) => {
      await prisma.history.create({
        data: {
          manga: {
            connect: {
              mangaId: chapter.mangaId,
            },
          },
          chapter: {
            connect: {
              chapterId: chapter.chapterId,
            },
          },
          user: {
            connect: {
              userId: userId,
            },
          },
          mediaId: chapter.mediaId,
          chapterName: chapter.chapterName,
        },
      })

      await prisma.latest.upsert({
        where: {
          chapterId_userId: {
            chapterId: chapter.chapterId,
            userId: userId,
          },
        },
        update: {
          chapterId: chapter.chapterId,
          finish: 1,
        },
        create: {
          page: 0,
          finish: 1,
          mangaId: chapter.mangaId,
          chapterId: chapter.chapterId,
          userId: userId,
        },
      })
    })

    const saveResponse = new SResponse({ code: 0, message: '操作成功', data: null })
    return response.json(saveResponse)
  }

  public async unread_all_chapters({ request, params, response }: HttpContext) {
    const { userId } = request as any
    const { mangaId } = params
    await prisma.history.deleteMany({ where: { mangaId, userId } })
    await prisma.latest.deleteMany({where: {mangaId, userId}})

    const saveResponse = new SResponse({ code: 0, message: '操作成功', data: null })
    return response.json(saveResponse)
  }

  /**
   * 判断章节是否已阅读
   * @param param0 
   * @returns 
   */
  public async chapter_is_read({ request, params, response }: HttpContext) { 
    const { userId } = request as any
    const { chapterId } = params
    const history = await prisma.history.findFirst({
      where: {
        userId,
        chapterId: chapterId,
      },
    })
    const showResponse = new SResponse({ code: 0, message: '', data: !!history })
    return response.json(showResponse)
  }
}
