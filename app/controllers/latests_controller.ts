import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
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

    const [list, countResult]: any = await Promise.all([
      isPgsql
        ? this.raw_sql_select_postgres({ userId, page: effectivePage, pageSize: effectivePageSize })
        : this.raw_sql_select_mysql({ userId, page: effectivePage, pageSize: effectivePageSize }),
      isPgsql
        ? prisma.$queryRaw`SELECT COUNT(DISTINCT "mangaId") AS "count" FROM "latest" WHERE "userId" = ${userId}`
        : prisma.$queryRaw`SELECT COUNT(DISTINCT mangaId) AS count FROM latest WHERE userId = ${userId}`,
    ])

    // 批量统计未观看章节数
    const mangaIds = list.map((m: any) => Number(m.mangaId)).filter(Boolean)
    const [chapterCounts, historyCounts] = await Promise.all([
      prisma.chapter.groupBy({
        by: ['mangaId'],
        where: { mangaId: { in: mangaIds } },
        _count: { chapterId: true },
      }),
      prisma.history.groupBy({
        by: ['mangaId', 'chapterId'],
        where: { mangaId: { in: mangaIds }, userId },
      }),
    ])

    const chapterCountMap = new Map(
      chapterCounts.map((item: any) => [item.mangaId, item._count.chapterId])
    )
    const historyCountMap = new Map<number, number>()
    for (const item of historyCounts) {
      historyCountMap.set(item.mangaId, (historyCountMap.get(item.mangaId) || 0) + 1)
    }

    list.forEach((manga: any) => {
      const total = chapterCountMap.get(Number(manga.mangaId)) || 0
      const watched = historyCountMap.get(Number(manga.mangaId)) || 0
      manga.unWatched = Math.max(total - watched, 0)
    })

    return response.json({ code: 200, message: '', list, count: Number(countResult[0]?.count || 0) })
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

    return response.json({ code: 200, message: '', data: latest })
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
    return response.json({ code: 200, message: '', data: latest })
  }

  public async update({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId } = await chapterIdParamValidator.validate(params)
    const modifyData = await updateLatestValidator.validate(request.all())
    const latest = await prisma.latest.updateMany({
      where: { chapterId, userId },
      data: modifyData,
    })
    return response.json({ code: 200, message: '更新成功', data: latest })
  }

  public async destroy({ request, params, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId } = await chapterIdParamValidator.validate(params)
    const latest = await prisma.latest.deleteMany({ where: { chapterId, userId } })
    return response.json({ code: 200, message: '', data: latest })
  }
}
