/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-02-14 18:45:39
 * @FilePath: \smanga-adonis\app\controllers\media_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '#interfaces/response'
import { TaskPriority } from '#type/index'
import { addTask } from '#services/queue_service'
import CreateMediaPosterJob from '#services/create_media_poster_job'

export default class MediaController {
  public async index({ request, response }: HttpContext) {
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

    const { page, pageSize } = request.only(['page', 'pageSize', 'order'])
    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      where: {
        deleteFlag: 0,
        ...(!isAdmin && { mediaId: { in: mediaPermissons.map((item) => item.mediaId) } }),
      },
    }

    const [list, count] = await Promise.all([
      prisma.media.findMany(queryParams),
      prisma.media.count({ where: queryParams.where }),
    ])

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })
    return response.json(listResponse)
  }

  public async show({ request, params, response }: HttpContext) {
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

    let { mediaId } = params

    // 判断是否有权限查看该媒体库
    if (!isAdmin && !mediaPermissons.some((item) => item.mediaId === mediaId)) {
      return response
        .status(401)
        .json(new SResponse({ code: 401, message: '无权限查看', status: 'token error' }))
    }
    const media = await prisma.media.findUnique({ where: { mediaId } })
    const showResponse = new SResponse({ code: 0, message: '', data: media })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = request.only([
      'browseType',
      'direction',
      'directoryFormat',
      'mediaName',
      'mediaType',
      'removeFirst',
    ])

    let media = null
    media = await prisma.media.findFirst({
      where: {
        mediaName: insertData.mediaName,
      },
    })

    // 如果存在媒体库则取消删除标识
    if (media) {
      await prisma.media.update({
        where: { mediaId: media.mediaId },
        data: { deleteFlag: 0 },
      })
    } else { 
      media = await prisma.media.create({
        data: insertData,
      })
    }
    
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: media })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { mediaId } = params
    const modifyData = request.only([
      'browseType',
      'direction',
      'directoryFormat',
      'mediaName',
      'mediaType',
      'removeFirst',
    ])
    const media = await prisma.media.update({
      where: { mediaId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: media })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { mediaId } = params
    const media = await prisma.media.update({ where: { mediaId }, data: { deleteFlag: 1 } })

    addTask({
      taskName: `delete_media_${media.mediaId}`,
      command: 'deleteMedia',
      args: { mediaId: media.mediaId },
      priority: TaskPriority.deleteManga
    })
    
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: media })
    return response.json(destroyResponse)
  }

  public async poster({ params, response }: HttpContext) {
    const { mediaId } = params
    const posterFile = await new CreateMediaPosterJob({ mediaId: Number(mediaId) }).run()
    const posterResponse = new SResponse({ code: 0, message: '', data: posterFile })
    return response.json(posterResponse)
  }
}
