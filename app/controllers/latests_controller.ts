import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { get_config } from '#utils/index'
const isPgsql = ['pgsql', 'postgresql'].includes(get_config().sql.client)

export default class LatestsController {
  public async index({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, pageSize } = request.only(['page', 'pageSize', 'order'])
    const list: any = isPgsql
      ? await this.raw_sql_select_postgres({ userId, page, pageSize })
      : await this.raw_sql_select_mysql({ userId, page, pageSize })

    // 统计未观看章节数
    for (let i = 0; i < list.length; i++) {
      const manga: any = list[i]
      const mangaId = Number(manga.mangaId)
      const chapterCount = await prisma.chapter.count({ where: { mangaId } })
      const historys = await prisma.history.groupBy({
        by: ['chapterId'],
        where: { mangaId, userId },
      })

      manga.unWatched = chapterCount - historys.length
      if (manga.unWatched < 0) {
        manga.unWatched = 0
      }
    }

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list?.length,
    })
    return response.json(listResponse)
  }

  private async raw_sql_select_postgres({ userId, page, pageSize }: any) {
    return await prisma.$queryRaw`SELECT 
          "latest"."mangaId",
          MAX("latest"."chapterId") AS "chapterId",  -- 使用聚合函数选择 chapterId
          MAX("latest"."mangaId") AS "mangaId",  -- 使用聚合函数选择 mangaId
          MAX("latest"."userId") AS "userId",          -- 使用聚合函数选择 userId
          MAX("manga"."mediaId") AS "mediaId", -- 使用聚合函数选择 mediaId
          MAX("manga"."mangaName") AS "mangaName", -- 使用聚合函数选择 mangaName
          MAX("manga"."mangaCover") AS "mangaCover",   -- 使用聚合函数选择 mangaCover
          MAX("manga"."browseType") AS "browseType"      -- 使用聚合函数选择 browseType
      FROM 
          "latest"
      JOIN 
          "manga" ON "latest"."mangaId" = "manga"."mangaId"
      WHERE 
          "latest"."userId" = ${userId}
      GROUP BY 
          "latest"."mangaId"
      ORDER BY 
          MAX("latest"."updateTime") DESC  -- 根据 updateTime 排序
      LIMIT 
          ${pageSize ? pageSize : 10}
      OFFSET
        ${(page - 1) * pageSize}
      `
  }

  private async raw_sql_select_mysql({ userId, page, pageSize }: any) {
    return await prisma.$queryRaw`SELECT 
          latest.mangaId,
          MAX(latest.chapterId) AS chapterId,  -- 使用聚合函数选择 chapterId
          MAX(latest.mangaId) AS mangaId,  -- 使用聚合函数选择 mangaId
          MAX(latest.userId) AS userId,          -- 使用聚合函数选择 userId
          MAX(manga.mediaId) AS mediaId, -- 使用聚合函数选择 mediaId
          MAX(manga.mangaName) AS mangaName, -- 使用聚合函数选择 mangaName
          MAX(manga.mangaCover) AS mangaCover,   -- 使用聚合函数选择 mangaCover
          MAX(manga.browseType) AS browseType      -- 使用聚合函数选择 browseType
      FROM 
          latest
      JOIN 
          manga ON latest.mangaId = manga.mangaId
      WHERE 
          latest.userId = ${userId}
      GROUP BY 
          latest.mangaId
      ORDER BY 
          MAX(latest.updateTime) DESC  -- 根据 updateTime 排序
      LIMIT 
          ${pageSize ? pageSize : 10}
      OFFSET    
        ${(page - 1) * pageSize};
      `
  }

  public async show({ request, params, response }: HttpContext) {
    const { userId } = request as any
    let { mangaId } = params
    const latest: any = await prisma.latest.findFirst({
      where: {
        userId,
        mangaId,
      },
      orderBy: {
        updateTime: 'desc',
      },
      include: {
        manga: {
          select: {
            mediaId: true,
          },
        },
        chapter: {
          select: {
            chapterId: true,
            chapterNumber: true,
            chapterName: true,
          },
        },
      },
    })

    const chapters = await prisma.chapter.findMany({
      where: { mangaId },
      orderBy: { chapterNumber: 'asc' },
    })
    const latestChapterIndex = chapters.findIndex(
      (chapter) => chapter.chapterId === latest?.chapterId
    )
    if (latestChapterIndex !== -1 && latestChapterIndex < chapters.length - 1) {
      latest.nextChapter = chapters[latestChapterIndex + 1]
    }

    const showResponse = new SResponse({ code: 0, message: '', data: latest })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, count, chapterId, mangaId, finish } = request.only([
      'page',
      'count',
      'chapterId',
      'mangaId',
      'finish',
    ])
    const latest = await prisma.latest.upsert({
      where: {
        chapterId_userId: {
          chapterId,
          userId,
        },
      },
      update: { page, count, chapterId, mangaId, finish, userId },
      create: { page, count, chapterId, mangaId, finish, userId },
    })
    const saveResponse = new SResponse({ code: 0, message: '', data: latest })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId } = params
    const modifyData = request.only(['page', 'chapterId', 'finish'])
    const latest = await prisma.latest.updateMany({
      where: { chapterId, userId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: latest })
    return response.json(updateResponse)
  }

  public async destroy({ request, params, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId } = params
    const latest = await prisma.latest.deleteMany({ where: { chapterId, userId } })
    const destroyResponse = new SResponse({ code: 0, message: '', data: latest })
    return response.json(destroyResponse)
  }
}
