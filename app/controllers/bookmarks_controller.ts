import type { HttpContext } from '@adonisjs/core/http'
import path from 'node:path'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { compressImageToSize } from '../utils/sharp.js'
import { path_bookmark, get_config, s_delete } from '../utils/index.js'

// 书签封面文件名前缀,用于识别可删除的生成文件
const BOOKMARK_FILE_PREFIX = 'smanga_bookmark_'

type OrderBy = Record<string, 'asc' | 'desc'>

export default class BookmarksController {
  public async index({ request, response }: HttpContext) {
    const { userId } = request as any
    const { chapterId, page, pageSize, order } = request.only([
      'page', 'pageSize', 'chapterId', 'order',
    ])

    const chapterIdNum = chapterId ? Number(chapterId) : undefined
    const orderBy = this.build_order_by(order)

    let listResponse = null
    if (page) {
      listResponse = await this.paginate(
        userId, chapterIdNum, Number(page), Number(pageSize), orderBy
      )
    } else {
      listResponse = await this.no_paginate(userId, chapterIdNum, orderBy)
    }

    return response.json(listResponse)
  }

  // 构造 orderBy,默认按 createTime 倒序
  private build_order_by(order?: string): OrderBy {
    const sort: 'asc' | 'desc' = order && /desc/i.test(order) ? 'desc' : 'asc'
    if (!order) return { createTime: 'desc' }
    if (/createTime/i.test(order)) return { createTime: sort }
    if (/updateTime/i.test(order)) return { updateTime: sort }
    if (/page/i.test(order)) return { page: sort }
    return { createTime: 'desc' }
  }

  // 不分页
  private async no_paginate(userId: number, chapterId: number | undefined, orderBy: OrderBy) {
    const where = {
      ...(chapterId && { chapterId }),
      userId,
    }

    const list = await prisma.bookmark.findMany({ where, orderBy })

    return new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
  }

  // 分页
  private async paginate(
    userId: number,
    chapterId: number | undefined,
    page: number,
    pageSize: number,
    orderBy: OrderBy
  ) {
    const where = {
      ...(chapterId && { chapterId }),
      userId,
    }

    const queryParams = {
      skip: (page - 1) * pageSize,
      take: pageSize,
      where,
      orderBy,
      include: {
        chapter: { select: { chapterName: true } },
        manga: { select: { mangaName: true } },
      },
    }

    const [list, count] = await Promise.all([
      prisma.bookmark.findMany(queryParams),
      prisma.bookmark.count({ where }),
    ])

    // 批量查询 latest, 避免 N+1
    const chapterIds = Array.from(
      new Set(
        list
          .map((b: any) => Number(b.chapterId))
          .filter((id: number) => Number.isFinite(id) && id > 0)
      )
    )
    const latests = chapterIds.length
      ? await prisma.latest.findMany({
          where: { userId, chapterId: { in: chapterIds } },
        })
      : []
    const latestMap = new Map<number, any>()
    for (const lt of latests) latestMap.set(Number(lt.chapterId), lt)

    return new ListResponse({
      code: 0,
      message: '',
      list: list.map((item: any) => {
        const latest = latestMap.get(Number(item.chapterId)) || null
        if (latest) latest.page = item.page
        return {
          ...item,
          chapterName: item.chapter?.chapterName,
          mangaName: item.manga?.mangaName,
          latest,
        }
      }),
      count,
    })
  }

  public async show({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const bookmarkId = Number(params.bookmarkId)

    // 归属校验
    const bookmark = await prisma.bookmark.findFirst({
      where: { bookmarkId, userId },
    })
    if (!bookmark) {
      return response.json(new SResponse({ code: 1, message: '书签不存在或无权访问' }))
    }

    return response.json(new SResponse({ code: 0, message: '', data: bookmark }))
  }

  public async create({ request, response }: HttpContext) {
    const { userId } = request as any
    const body = request.only([
      'chapterId', 'mangaId', 'mediaId', 'browseType', 'page', 'pageImage',
    ])

    // 必要字段校验
    const chapterId = Number(body.chapterId)
    const mangaId = Number(body.mangaId)
    const mediaId = Number(body.mediaId)
    const pageNum = Number(body.page)
    if (!chapterId || !mangaId || !mediaId || !Number.isFinite(pageNum)) {
      return response.json(new SResponse({ code: 1, message: '参数缺失或非法' }))
    }

    // 唯一键冲突前置校验: schema 定义 @@unique([userId, chapterId, page])
    // 仅限当前用户自己的书签,不跨用户干扰
    const exist = await prisma.bookmark.findFirst({
      where: { userId, chapterId, page: pageNum },
    })
    if (exist) {
      return response.json(new SResponse({ code: 1, message: '当前页已存在书签' }))
    }

    // 生成封面: 文件名按 chapterId + page 避免相互覆盖
    let outputFile = ''
    if (body.pageImage) {
      try {
        const bookmarkPath = path_bookmark()
        const config = get_config()
        outputFile = path.join(
          bookmarkPath,
          `${BOOKMARK_FILE_PREFIX}${chapterId}_${pageNum}.jpg`
        )
        await compressImageToSize(body.pageImage, outputFile, config.compress.bookmark)
      } catch (err: any) {
        console.error('书签封面生成失败:', err?.message || err)
        // 封面失败不阻断书签创建, 清理半成品文件
        if (outputFile) s_delete(outputFile)
        outputFile = ''
      }
    }

    // 写库; 失败时回滚已生成的封面文件
    try {
      const bookmark = await prisma.bookmark.create({
        data: {
          chapterId,
          mangaId,
          mediaId,
          browseType: body.browseType,
          page: pageNum,
          pageImage: outputFile,
          userId,
        },
      })
      return response.json(new SResponse({ code: 0, message: '新增成功', data: bookmark }))
    } catch (err: any) {
      if (outputFile) s_delete(outputFile)
      // P2002: 唯一键冲突 (并发下前置检查与 create 之间的竞态)
      if (err?.code === 'P2002') {
        return response.json(new SResponse({ code: 1, message: '当前页已存在书签' }))
      }
      return response.json(new SResponse({ code: 1, message: '新增失败', error: err?.message }))
    }
  }

  public async update({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const bookmarkId = Number(params.bookmarkId)

    // 归属校验
    const origin = await prisma.bookmark.findFirst({ where: { bookmarkId, userId } })
    if (!origin) {
      return response.json(new SResponse({ code: 1, message: '书签不存在或无权访问' }))
    }

    // 字段白名单: 只允许更新 page / browseType,禁止修改所属关系及封面路径
    const body = request.only(['page', 'browseType'])
    const data: { page?: number; browseType?: string } = {}
    if (body.page !== undefined) data.page = Number(body.page)
    if (body.browseType !== undefined) data.browseType = body.browseType

    const bookmark = await prisma.bookmark.update({
      where: { bookmarkId },
      data,
    })
    return response.json(new SResponse({ code: 0, message: '更新成功', data: bookmark }))
  }

  public async destroy({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const bookmarkId = Number(params.bookmarkId)

    // 归属校验
    const bookmark = await prisma.bookmark.findFirst({ where: { bookmarkId, userId } })
    if (!bookmark) {
      return response.json(new SResponse({ code: 1, message: '书签不存在或无权访问' }))
    }

    // 删除书签封面文件
    if (bookmark.pageImage && bookmark.pageImage.includes(BOOKMARK_FILE_PREFIX)) {
      s_delete(bookmark.pageImage)
    }

    const bookmarkDelete = await prisma.bookmark.delete({ where: { bookmarkId } })
    return response.json(new SResponse({ code: 0, message: '删除成功', data: bookmarkDelete }))
  }

  public async destroy_batch({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const ids = String(params.bookmarkIds)
      .split(',')
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0)

    if (!ids.length) {
      return response.json(new SResponse({ code: 1, message: '未指定书签' }))
    }

    // 仅操作当前用户的书签
    const bookmarks = await prisma.bookmark.findMany({
      where: { bookmarkId: { in: ids }, userId },
    })
    if (!bookmarks.length) {
      return response.json(new SResponse({ code: 1, message: '无可删除书签' }))
    }

    // 删除书签封面文件
    for (const bm of bookmarks) {
      if (bm.pageImage && bm.pageImage.includes(BOOKMARK_FILE_PREFIX)) {
        s_delete(bm.pageImage)
      }
    }

    const ownedIds = bookmarks.map((b) => b.bookmarkId)
    const deleteResponse = await prisma.bookmark.deleteMany({
      where: { bookmarkId: { in: ownedIds } },
    })

    return response.json(new SResponse({ code: 0, message: '删除成功', data: deleteResponse }))
  }
}
