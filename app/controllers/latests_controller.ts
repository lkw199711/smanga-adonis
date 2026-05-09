import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { get_config } from '#utils/index'
import {
  listLatestValidator,
  mangaIdParamValidator,
  chapterIdParamValidator,
  createLatestValidator,
  updateLatestValidator,
} from '#validators/latest'
const isPgsql = ['pgsql', 'postgresql'].includes(get_config().sql.client)

export default class LatestsController {
  public async index({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, pageSize } = await listLatestValidator.validate(request.qs())
    const effectivePage = page ?? 1
    const effectivePageSize = pageSize ?? 10
    const list: any = isPgsql
      ? await this.raw_sql_select_postgres({ userId, page: effectivePage, pageSize: effectivePageSize })
      : await this.raw_sql_select_mysql({ userId, page: effectivePage, pageSize: effectivePageSize })

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
          MAX("latest"."chapterId") AS "chapterId",
          MAX("latest"."mangaId") AS "mangaId",
          MAX("latest"."userId") AS "userId",
          MAX("manga"."mediaId") AS "mediaId",
          MAX("manga"."mangaName") AS "mangaName",
          MAX("manga"."mangaCover") AS "mangaCover",
          MAX("manga"."browseType") AS "browseType"
      FROM 
          "latest"
      JOIN 
          "manga" ON "latest"."mangaId" = "manga"."mangaId"
      WHERE 
          "latest"."userId" = ${userId}
      GROUP BY 
          "latest"."mangaId"
      ORDER BY 
          MAX("latest"."updateTime") DESC
      LIMIT 
          ${pageSize ? pageSize : 10}
      OFFSET
        ${(page - 1) * pageSize}
      `
  }

  private async raw_sql_select_mysql({ userId, page, pageSize }: any) {
    return await prisma.$queryRaw`SELECT 
          latest.mangaId,
          MAX(latest.chapterId) AS chapterId,
          MAX(latest.mangaId) AS mangaId,
          MAX(latest.userId) AS userId,
          MAX(manga.mediaId) AS mediaId,
          MAX(manga.mangaName) AS mangaName,
          MAX(manga.mangaCover) AS mangaCover,
          MAX(manga.browseType) AS browseType
      FROM 
          latest
      JOIN 
          manga ON latest.mangaId = manga.mangaId
      WHERE 
          latest.userId = ${userId}
      GROUP BY 
          latest.mangaId
      ORDER BY 
          MAX(latest.updateTime) DESC
      LIMIT 
          ${pageSize ? pageSize : 10}
      OFFSET    
        ${(page - 1) * pageSize};
      `
  }

  public async show({ request, params, response }: HttpContext) {
    const { userId } = request as any
    const { mangaId } = await mangaIdParamValidator.validate(params)
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
    const { page, count, chapterId, mangaId, finish } = await createLatestValidator.validate(
      request.all()
    )
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
    const { chapterId } = await chapterIdParamValidator.validate(params)
    const modifyData = await updateLatestValidator.validate(request.all())
    const latest = await prisma.latest.updateMany({
      where: { chapterId, userId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: latest })
    return response.json(updateResponse)
  }

  public async destroy({ request, params, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId } = await chapterIdParamValidator.validate(params)
    const latest = await prisma.latest.deleteMany({ where: { chapterId, userId } })
    const destroyResponse = new SResponse({ code: 0, message: '', data: latest })
    return response.json(destroyResponse)
  }
}
