import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { sliceChartValidator } from '#validators/chart'

export default class ChartsController {
  public async count({ request, response }: HttpContext) {
    const userId = (request as any).userId as number | undefined
    const user = userId ? await prisma.user.findUnique({ where: { userId } }) : null
    if (!user) {
      return response.status(401).json({ code: 401, message: '用户不存在', status: 'token error' })
    }

    const isAdmin = user.role === 'admin' || user.mediaPermit === 'all'
    const mediaPermissons = isAdmin
      ? []
      : await prisma.mediaPermisson.findMany({ where: { userId }, select: { mediaId: true } })
    const mediaWhere = isAdmin ? {} : { mediaId: { in: mediaPermissons.map((m) => m.mediaId) } }

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - 6)

    const [mangaCount, chapterCount, mangaWeekAdd, chapterWeekAdd, readToday, readThisWeek] =
      await Promise.all([
        prisma.manga.count({ where: { deleteFlag: 0, ...(mediaWhere as any) } }),
        prisma.chapter.count({ where: { deleteFlag: 0, ...(mediaWhere as any) } }),
        prisma.manga.count({
          where: { deleteFlag: 0, createTime: { gte: weekStart }, ...(mediaWhere as any) },
        }),
        prisma.chapter.count({
          where: { deleteFlag: 0, createTime: { gte: weekStart }, ...(mediaWhere as any) },
        }),
        prisma.history.count({ where: { userId, createTime: { gte: todayStart } } }),
        prisma.history.count({ where: { userId, createTime: { gte: weekStart } } }),
      ])

    return response.json({
      code: 200,
      data: { mangaCount, chapterCount, mangaWeekAdd, chapterWeekAdd, readToday, readThisWeek },
      message: '',
    })
  }

  public async browse({ response }: HttpContext) {
    // 根据浏览类型分类漫画
    // 条漫 单页 双叶 裁剪
    let typeObj: any = {
      flow: 0,
      single: 0,
      double: 0,
      half: 0,
    }

    const browseTypeCounts = await prisma.manga.groupBy({
      by: ['browseType'],
      _count: {
        browseType: true,
      },
    })

    browseTypeCounts.forEach((item) => {
      typeObj[item.browseType] = item._count.browseType
    })

    return response.json({ code: 200, data: typeObj, message: '' })
  }

  public async tag({ request, response }: HttpContext) {
    const { slice } = await sliceChartValidator.validate(request.qs())
    const sliceNum = slice ?? 5
    const tagCounts = await prisma.mangaTag.groupBy({
      by: ['tagId'],
      _count: {
        tagId: true,
      },
      orderBy: {
        _count: {
          tagId: 'desc',
        },
      },
      take: sliceNum,
    })

    // 批量查询 tag 名称
    const tagIds = tagCounts.map((t) => t.tagId)
    const tags = await prisma.tag.findMany({
      where: { tagId: { in: tagIds } },
      select: { tagId: true, tagName: true },
    })
    const tagMap = new Map(tags.map((t) => [t.tagId, t.tagName]))

    return response.json({
      code: 200,
      data: tagCounts.map((item) => ({
        tagId: item.tagId,
        tagName: tagMap.get(item.tagId) || '',
        count: item._count.tagId,
      })),
      message: '',
    })
  }

  public async ranking({ request, response }: HttpContext) {
    const { slice } = await sliceChartValidator.validate(request.qs())
    const sliceNum = slice ?? 5

    const mangaRanking = await prisma.history.groupBy({
      by: ['mangaId'],
      _count: {
        mangaId: true,
      },
      orderBy: {
        _count: {
          mangaId: 'desc',
        },
      },
      take: sliceNum,
    })

    // 批量查询 manga 名称
    const mangaIds = mangaRanking.map((m) => m.mangaId)
    const mangas = await prisma.manga.findMany({
      where: { mangaId: { in: mangaIds } },
      select: { mangaId: true, mangaName: true },
    })
    const mangaMap = new Map(mangas.map((m) => [m.mangaId, m.mangaName]))

    return response.json({
      code: 200,
      data: mangaRanking.map((item) => ({
        mangaId: item.mangaId,
        mangaName: mangaMap.get(item.mangaId) || '',
        count: item._count.mangaId,
      })),
      message: '',
    })
  }

  public async frequency({ request, response }: HttpContext) {
    const { userId } = request as any

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 6) // 从7天前的日期开始
    startDate.setHours(0, 0, 0, 0) // 设置时间为当天开始

    const historyRecords = await prisma.history.findMany({
      where: {
        userId,
        createTime: {
          gte: startDate, // 只获取近7天的记录
        },
      },
      orderBy: {
        createTime: 'asc',
      },
    })

    const days = 7
    const dateMap: any = {}

    // 初始化近7天的日期，并将浏览量设置为0
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + i)
      const formattedDate = date.toISOString().split('T')[0]
      dateMap[formattedDate] = { date: formattedDate, num: 0 }
    }

    // 处理查询结果，按日期分组统计浏览量
    historyRecords.forEach((record) => {
      const date = record.createTime.toISOString().split('T')[0]
      if (dateMap[date]) {
        dateMap[date].num += 1
      }
    })

    // 将结果转换为数组并按日期排序
    const result = Object.values(dateMap).sort(
      (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    return response.json({ code: 200, data: result, message: '' })
  }
}
