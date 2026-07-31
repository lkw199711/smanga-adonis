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

  /**
   * 首页继续阅读列表。
   * 与漫画详情页保持相同规则：
   * - 当前章节未读完：继续当前章节和页码
   * - 当前章节已读完：继续下一章节第一页
   * - 当前章节已读完且没有下一章：不再出现在继续阅读中
   */
  public async progress({ request, response }: HttpContext) {
    const { userId } = request as any
    const { page, pageSize } = await listLatestValidator.validate(request.qs())
    const effectivePage = page ?? 1
    const effectivePageSize = pageSize ?? 10
    const requiredCount = effectivePage * effectivePageSize
    const candidatePageSize = Math.max(effectivePageSize * 2, 20)
    const eligibleList: any[] = []
    let candidatePage = 1

    // 过滤必须发生在最终分页之前，否则最近记录中有已读完漫画时，首页会少于六项。
    while (eligibleList.length < requiredCount) {
      const mangaList: any = isPgsql
        ? await this.raw_sql_select_postgres({
            userId,
            page: candidatePage,
            pageSize: candidatePageSize,
          })
        : await this.raw_sql_select_mysql({
            userId,
            page: candidatePage,
            pageSize: candidatePageSize,
          })

      if (!mangaList.length) break

      const resolvedList = await Promise.all(
        mangaList.map((item: any) =>
          this.resolve_progress_item(userId, Number(item.mangaId))
        )
      )
      eligibleList.push(...resolvedList.filter(Boolean))

      if (mangaList.length < candidatePageSize) break
      candidatePage += 1
    }

    const offset = (effectivePage - 1) * effectivePageSize
    const list = eligibleList.slice(offset, offset + effectivePageSize)
    const mangaIds = list.map((item: any) => Number(item.mangaId)).filter(Boolean)
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

    list.forEach((item: any) => {
      const total = chapterCountMap.get(Number(item.mangaId)) || 0
      const watched = historyCountMap.get(Number(item.mangaId)) || 0
      item.unWatched = Math.max(total - watched, 0)
    })

    return response.json({
      code: 200,
      message: '',
      list,
      count: list.length,
    })
  }

  private async resolve_progress_item(userId: number, mangaId: number) {
    const latest = await prisma.latest.findFirst({
      where: { userId, mangaId },
      orderBy: [{ updateTime: 'desc' }, { latestId: 'desc' }],
      include: {
        manga: {
          select: {
            mediaId: true,
            mangaName: true,
            mangaCover: true,
            chapterCount: true,
            browseType: true,
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

    if (!latest) return null

    let targetChapter = latest.chapter
    let targetPage = latest.page
    let targetCount = latest.count
    let targetFinish = latest.finish

    if (latest.finish) {
      const chapters = await prisma.chapter.findMany({
        where: { mangaId },
        orderBy: { chapterNumber: 'asc' },
        select: {
          chapterId: true,
          chapterNumber: true,
          chapterName: true,
        },
      })

      // 已读完的章节集合（latest.finish 标记），用于跳过已读完的章节。
      const finishedLatests = await prisma.latest.findMany({
        where: { userId, mangaId, finish: { gt: 0 } },
        select: { chapterId: true },
      })
      const finishedChapterIdSet = new Set(finishedLatests.map((item) => item.chapterId))

      const currentIndex = chapters.findIndex(
        (chapter) => chapter.chapterId === latest.chapterId
      )

      // 从当前章节向后寻找第一个未读完的章节。
      let nextChapter = null
      if (currentIndex !== -1) {
        for (let i = currentIndex + 1; i < chapters.length; i++) {
          if (!finishedChapterIdSet.has(chapters[i].chapterId)) {
            nextChapter = chapters[i]
            break
          }
        }
      }

      // 与漫画详情页一致：后续章节全部已读完时，不再属于继续阅读。
      if (!nextChapter) return null

      targetChapter = nextChapter
      targetPage = 1
      targetCount = null
      targetFinish = 0
    }

    const { manga, chapter: _chapter, ...latestData } = latest
    return {
      ...latestData,
      ...manga,
      ...targetChapter,
      page: targetPage,
      count: targetCount,
      finish: targetFinish,
    }
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
          MAX("manga"."chapterCount") AS "chapterCount",
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
          MAX(manga.chapterCount) AS chapterCount,
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
      // 跳过已读完的章节（latest.finish 标记），取第一个未读完的章节；
      // 若后续章节全部已读完，则不返回 nextChapter。
      const finishedLatests = await prisma.latest.findMany({
        where: { userId, mangaId, finish: { gt: 0 } },
        select: { chapterId: true },
      })
      const finishedChapterIdSet = new Set(finishedLatests.map((item) => item.chapterId))
      for (let i = latestChapterIndex + 1; i < chapters.length; i++) {
        if (!finishedChapterIdSet.has(chapters[i].chapterId)) {
          latest.nextChapter = chapters[i]
          break
        }
      }
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
