import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '#interfaces/response'
import { Prisma } from '@prisma/client'
import { TaskPriority } from '#type/index'
import { addTask } from '#services/queue_service'
import ReloadMangaMetaJob from '#services/reload_manga_meta_job'
import fs from 'fs'
import { order_params, read_json } from '#utils/index'

export default class MangaController {
  public async index({ request, response }: HttpContext) {
    const { mediaId, page, pageSize, keyWord, order } = request.only([
      'mediaId',
      'page',
      'pageSize',
      'chapterId',
      'order',
      'keyWord',
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

    if (!isAdmin) {
      // 非管理员权限
      const mediaIds = mediaPermissons.map((item: any) => item.mediaId)
      if (!mediaIds.includes(Number(mediaId))) {
        return response
          .status(401)
          .json(new SResponse({ code: 401, message: '无权限操作', status: 'permisson error' }))
      }
    }

    let listResponse = null
    if (page) {
      listResponse = await this.paginate({ mediaId, page, pageSize, keyWord, userId, order })
    } else {
      listResponse = await this.no_paginate({ mediaId, order })
    }

    return response.json(listResponse)
  }

  // 不分页
  private async no_paginate({ mediaId, order }: any) {
    const queryParams = {
      where: {
        ...(mediaId && { mediaId }),
        deleteFlag: 0,
      },
      orderBy: order_params(order, 'manga'),
    }

    const list = await prisma.manga.findMany(queryParams)

    return new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
  }

  // 分页
  private async paginate({ mediaId, page, pageSize, keyWord, userId, order }: any) {

    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      where: {
        ...(mediaId && { mediaId }),
        ...(keyWord && { subTitle: { contains: keyWord } }),
        deleteFlag: 0,
      },
      orderBy: order_params(order, 'manga'),
    }

    const [list, count] = await Promise.all([
      prisma.manga.findMany(queryParams),
      prisma.manga.count({ where: queryParams.where }),
    ])

    // 统计未观看章节数
    for (let i = 0; i < list.length; i++) {
      const manga: any = list[i];
      const chapterCount = await prisma.chapter.count({ where: { mangaId: manga.mangaId } })
      const historys = await prisma.history.groupBy({
        by: ['chapterId'],
        where: { mangaId: manga.mangaId, userId },
      })

      manga.unWatched = chapterCount - historys.length
    }

    return new ListResponse({
      code: 0,
      message: '',
      list,
      count: count,
    })
  }

  public async show({ params, response }: HttpContext) {
    let { mangaId } = params
    mangaId = Number(mangaId)
    const manga = await prisma.manga.findUnique({
      where: { mangaId },
      include: {
        metas: true,
        mangaTags: {
          include: { tag: true },
        },
        media: {
          select: { sourceWebsite: true },
        }
      },
    })

    // 处理返回的数据 将mangaTags中的tag提取出来
    const result = {
      ...manga,
      tags: manga?.mangaTags.map((mangaTag) => mangaTag.tag),
      mangaTags: undefined,
    }
    const showResponse = new SResponse({ code: 0, message: '', data: result })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = request.body() as Prisma.mangaCreateInput
    const manga = await prisma.manga.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: manga })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { mangaId } = params
    const modifyData = request.only([
      'mangaName',
      'mangaNumber',
      'mangaPath',
      'mangaCover',
      'removeFirst',
      'browseType',
    ])
    const manga = await prisma.manga.update({
      where: { mangaId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: manga })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { mangaId } = params
    const manga = await prisma.manga.update({ where: { mangaId }, data: { deleteFlag: 1 } })

    addTask({
      taskName: `delete_manga_${manga.mangaId}`,
      command: 'deleteManga',
      args: { mangaId: manga.mangaId },
      priority: TaskPriority.deleteManga,
      timeout: 1000 * 60 * 10,
    })

    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: manga })
    return response.json(destroyResponse)
  }

  public async scan({ params, response }: HttpContext) {
    let { mangaId } = params
    const manga = await prisma.manga.findUnique({ where: { mangaId } })
    if (!manga) {
      return response
        .status(404)
        .json(new SResponse({ code: 404, message: '漫画不存在', status: 'not found' }))
    }

    const path = await prisma.path.findUnique({ where: { pathId: manga.pathId } })

    if (!path) {
      return response
        .status(404)
        .json(new SResponse({ code: 404, message: '路径不存在', status: 'not found' }))
    }

    addTask({
      taskName: `scan_manga_${manga.mangaId}`,
      command: 'taskScanManga',
      args: {
        pathId: path.pathId,
        mangaPath: manga.mangaPath,
        mangaName: manga.mangaName,
        mangaId: manga.mangaId
      },
      priority: TaskPriority.scanManga,
      timeout: 1000 * 60 * 60 * 2,
    })

    const scanResponse = new SResponse({ code: 0, message: '扫描任务添加成功', data: manga })
    return response.json(scanResponse)
  }

  public async edit_meta({ params, request, response }: HttpContext) {
    let { mangaId } = params
    let { title, author, publishDate, mangaCover, star, describe, tags, wirteMetaJson } = request.only(['title', 'author', 'publishDate', 'mangaCover', 'star', 'describe', 'tags', 'wirteMetaJson'])
    mangaId = Number(mangaId)

    // 修改或新增元数据
    const res = await Promise.all([
      this.meta_update(mangaId, 'title', title),
      this.meta_update(mangaId, 'author', author),
      this.meta_update(mangaId, 'publishDate', publishDate),
      this.meta_update(mangaId, 'mangaCover', mangaCover),
      this.meta_update(mangaId, 'star', star),
      this.meta_update(mangaId, 'describe', describe),
    ])

    if (wirteMetaJson) {
      const manga = await prisma.manga.findUnique({ where: { mangaId } })
      const mangaPath = manga?.mangaPath;
      if (mangaPath) {
        const metaPath = mangaPath + '-smanga-info';
        const metaFile = `${metaPath}/meta.json`;
        let metaData: any = {};
        if (!fs.existsSync(metaPath)) fs.mkdirSync(metaPath, { recursive: true });
        if (fs.existsSync(metaFile)) metaData = read_json(metaFile);
        if (author) metaData['author'] = author;
        if (publishDate) metaData['publishDate'] = publishDate;
        if (mangaCover) metaData['mangaCover'] = mangaCover;
        if (star) metaData['star'] = star;
        if (describe) metaData['describe'] = describe;
        if (tags) metaData['tags'] = tags;

        fs.writeFileSync(metaFile, JSON.stringify(metaData, null, 2), 'utf-8');
      }
    }

    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: res })
    return response.json(updateResponse)
  }

  async meta_update(mangaId: number, metaName: string, metaContent: string) {
    if (!metaContent) return;
    const meta = await prisma.meta.findFirst({
      where: { mangaId, metaName },
    })

    if (meta) {
      await prisma.meta.update({
        where: { metaId: meta.metaId },
        data: { metaContent },
      })
    } else {
      await prisma.meta.create({
        data: {
          mangaId,
          metaName,
          metaContent,
        },
      })
    }
  }
  /**
   * 重新扫描漫画元数据
   * @param param0 
   * @returns 
   */
  public async reload_meta({ params, response }: HttpContext) {
    let { mangaId } = params

    const res = await new ReloadMangaMetaJob({ mangaId }).run()

    const reloadMetaResponse = new SResponse({
      code: 0,
      message: '元数据更新成功',
      data: res,
    });

    return response.json(reloadMetaResponse)
  }

  public async add_tags({ params, request, response }: HttpContext) {
    let { mangaId } = params
    mangaId = Number(mangaId)
    const { tags, metaWriteJson } = request.only(['tags', 'metaWriteJson'])

    if (!Array.isArray(tags)) {
      return response.status(400).json(new SResponse({ code: 400, message: '标签必须是数组' }))
    }

    // 删除旧的标签
    await prisma.mangaTag.deleteMany({ where: { mangaId } })

    // 添加新的标签
    const mangaTags = tags.map((tag: any) => ({
      mangaId,
      tagId: tag.tagId,
    }))
    const createdTags = await prisma.mangaTag.createMany({
      data: mangaTags,
    })

    const addTagsResponse = new SResponse({
      code: 0,
      message: '标签添加成功',
      data: createdTags,
    })

    if (metaWriteJson) {
      const manga = await prisma.manga.findUnique({ where: { mangaId } })
      const mangaPath = manga?.mangaPath;
      if (mangaPath) {
        const metaPath = mangaPath + '-smanga-info';
        const metaFile = `${metaPath}/meta.json`;
        let metaData: any = {};
        if (!fs.existsSync(metaPath)) fs.mkdirSync(metaPath, { recursive: true });
        if (fs.existsSync(metaFile)) metaData = read_json(metaFile);

        metaData['tags'] = tags.map((tag: any) => tag.tagName);

        fs.writeFileSync(metaFile, JSON.stringify(metaData, null, 2), 'utf-8');
      }
    }

    return response.json(addTagsResponse)
  }
}
