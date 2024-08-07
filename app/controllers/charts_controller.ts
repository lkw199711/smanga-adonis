import type { HttpContext } from '@adonisjs/core/http'
import type { HttpContextWithUserId } from '#type/http.js'
import prisma from '#start/prisma'
import { SResponse } from '../interfaces/response.js'

export default class ChartsController {
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

    if (browseTypeCounts) {
      browseTypeCounts.forEach((item) => {
        typeObj[item.browseType] = item._count.browseType
      })
    }

    return response.json(new SResponse({ code: 0, data: typeObj, message: '' }))
  }

  public async tag({ request, response }: HttpContext) {
    const { slice = 5 } = request.only(['slice'])
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
      take: Number(slice),
    })

    const enrichedTagCounts = await Promise.all(
      tagCounts.map(async (tagCount) => {
        const tag = await prisma.tag.findUnique({
          where: { tagId: tagCount.tagId },
          select: { tagName: true },
        })
        return {
          ...tagCount,
          tagName: tag?.tagName,
        }
      })
    )

    return response.json(
      new SResponse({
        code: 0,
        data: enrichedTagCounts.map((item) => {
          return {
            tagId: item.tagId,
            tagName: item.tagName,
            count: item._count.tagId,
          }
        }),
        message: '',
      })
    )
  }

  public async ranking({ request, response }: HttpContext) {
    const { slice = 5 } = request.only(['slice'])

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
      take: Number(slice),
    })

    const enrichedMangaRanking = await Promise.all(
      mangaRanking.map(async (manga) => {
        const mangaInfo = await prisma.manga.findUnique({
          where: { mangaId: manga.mangaId },
          select: { mangaId: true, mangaName: true },
        })
        return {
          ...manga,
          mangaName: mangaInfo?.mangaName,
          count: manga._count.mangaId,
        }
      })
    )

    return response.json(
      new SResponse({
        code: 0,
        data: enrichedMangaRanking,
        message: '',
      })
    )
  }

  public async frequency({ request, response }: HttpContextWithUserId) {
    const { slice = 5 } = request.only(['slice'])
    const userId = request.userId
    
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
    const dateMap = {}

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
    const result = Object.values(dateMap).sort((a, b) => new Date(a.date) - new Date(b.date))

    return response.json(new SResponse({ code: 0, data: result, message: '' }))
  }
}
