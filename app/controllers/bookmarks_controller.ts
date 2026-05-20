import type { HttpContext } from '@adonisjs/core/http'
import path from 'node:path'
import prisma from '#start/prisma'
import { compressImageToSize } from '../utils/sharp.js'
import { path_bookmark, get_config, s_delete } from '../utils/index.js'
import {
  listBookmarkValidator,
  idParamBookmarkValidator,
  createBookmarkValidator,
  updateBookmarkValidator,
  batchIdsParamBookmarkValidator,
} from '#validators/bookmark'
import log from '#services/log_service'

// 书签封面文件名前缀,用于识别可删除的生成文件
const BOOKMARK_FILE_PREFIX = 'smanga_bookmark_'

type OrderBy = Record<string, 'asc' | 'desc'>

export default class BookmarksController {
  public async index({ request, response }: HttpContext) {
    const { userId } = request as any
    // 入参统一由 vine 校验与类型转换 (page/pageSize/chapterId 自动转 number)
    const { page, pageSize, chapterId, order } = await listBookmarkValidator.validate(
      request.qs()
    )

    const orderBy = this.build_order_by(order)

    let listResponse = null
    if (page) {
      listResponse = await this.paginate(
        userId, chapterId, page, pageSize ?? 10, orderBy
      )
    } else {
      listResponse = await this.no_paginate(userId, chapterId, orderBy)
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

    return { code: 200, message: '', list, count: list.length }
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

    return {
      code: 200,
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
    }
  }

  public async show({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const { bookmarkId } = await idParamBookmarkValidator.validate(params)

    // 归属校验
    const bookmark = await prisma.bookmark.findFirst({
      where: { bookmarkId, userId },
    })
    if (!bookmark) {
      return response.status(404).json({ code: 404, message: '书签不存在或无权访问' })
    }

    return response.json({ code: 200, message: '', data: bookmark })
  }

  public async create({ request, response }: HttpContext) {
    const { userId } = request as any
    // vine 已完成必要字段与类型校验 (chapterId/mangaId/mediaId 正整数, page 非负)
    const payload = await createBookmarkValidator.validate(request.all())
    const { chapterId, mangaId, mediaId, page: pageNum, browseType, pageImage } = payload

    // 唯一键冲突前置校验: schema 定义 @@unique([userId, chapterId, page])
    // 仅限当前用户自己的书签,不跨用户干扰
    const exist = await prisma.bookmark.findFirst({
      where: { userId, chapterId, page: pageNum },
    })
    if (exist) {
      return response.status(400).json({ code: 400, message: '当前页已存在书签' })
    }

    // 生成封面: 文件名按 chapterId + page 避免相互覆盖
    let outputFile = ''
    if (pageImage) {
      try {
        const bookmarkPath = path_bookmark()
        const config = get_config()
        outputFile = path.join(
          bookmarkPath,
          `${BOOKMARK_FILE_PREFIX}${chapterId}_${pageNum}.jpg`
        )
        await compressImageToSize(pageImage, outputFile, config.compress.bookmark)
      } catch (err: any) {
        void log.error({
          type: 'media',
          module: 'bookmark',
          action: 'bookmark.cover.generate.failed',
          message: `书签封面生成失败: ${err?.message || err}`,
          error: err,
          context: { chapterId, mangaId, mediaId, page: pageNum },
        })
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
          browseType: browseType ?? '',
          page: pageNum,
          pageImage: outputFile,
          userId,
        },
      })
      return response.json({ code: 200, message: '新增成功', data: bookmark })
    } catch (err: any) {
      if (outputFile) s_delete(outputFile)
      // P2002: 唯一键冲突 (并发下前置检查与 create 之间的竞态)
      if (err?.code === 'P2002') {
        return response.status(400).json({ code: 400, message: '当前页已存在书签' })
      }
      return response.status(500).json({ code: 500, message: '新增失败', error: err?.message })
    }
  }

  public async update({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const { bookmarkId } = await idParamBookmarkValidator.validate(params)

    // 归属校验
    const origin = await prisma.bookmark.findFirst({ where: { bookmarkId, userId } })
    if (!origin) {
      return response.status(404).json({ code: 404, message: '书签不存在或无权访问' })
    }

    // 字段白名单: 只允许更新 page / browseType, vine 已处理类型与可选项
    const body = await updateBookmarkValidator.validate(request.all())
    const data: { page?: number; browseType?: string } = {}
    if (body.page !== undefined) data.page = body.page
    if (body.browseType !== undefined) data.browseType = body.browseType

    const bookmark = await prisma.bookmark.update({
      where: { bookmarkId },
      data,
    })
    return response.json({ code: 200, message: '更新成功', data: bookmark })
  }

  public async destroy({ params, request, response }: HttpContext) {
    const { userId } = request as any
    const { bookmarkId } = await idParamBookmarkValidator.validate(params)

    // 归属校验
    const bookmark = await prisma.bookmark.findFirst({ where: { bookmarkId, userId } })
    if (!bookmark) {
      return response.status(404).json({ code: 404, message: '书签不存在或无权访问' })
    }

    // 删除书签封面文件
    if (bookmark.pageImage && bookmark.pageImage.includes(BOOKMARK_FILE_PREFIX)) {
      s_delete(bookmark.pageImage)
    }

    const bookmarkDelete = await prisma.bookmark.delete({ where: { bookmarkId } })
    return response.json({ code: 200, message: '删除成功', data: bookmarkDelete })
  }

  public async destroy_batch({ params, request, response }: HttpContext) {
    const { userId } = request as any
    // validator 已完成 CSV -> number[] 的转换与非空校验
    const { bookmarkIds: ids } = await batchIdsParamBookmarkValidator.validate(params)

    if (!ids.length) {
      return response.status(400).json({ code: 400, message: '未指定书签' })
    }

    // 仅操作当前用户的书签
    const bookmarks = await prisma.bookmark.findMany({
      where: { bookmarkId: { in: ids }, userId },
    })
    if (!bookmarks.length) {
      return response.status(404).json({ code: 404, message: '无可删除书签' })
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

    return response.json({ code: 200, message: '删除成功', data: deleteResponse })
  }
}
