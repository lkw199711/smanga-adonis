import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse, SResponseCode } from '#interfaces/response'
import { TaskPriority } from '#type/index'
import { addTask } from '#services/queue_service'
import CreateMediaPosterJob from '#services/create_media_poster_job'
import {
  listMediaValidator,
  idParamMediaValidator,
  createMediaValidator,
  updateMediaValidator,
  batchIdsMediaValidator,
} from '#validators/media'

export default class MediaController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response
        .status(403)
        .json(new SResponse({ code: 403, message: '无权限', status: 'no permission' }))
      return false
    }
    return true
  }

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

    const { page, pageSize } = await listMediaValidator.validate(request.qs())
    const where = {
      deleteFlag: 0,
      ...(!isAdmin && { mediaId: { in: mediaPermissons.map((item) => item.mediaId) } }),
    }
    const queryParams = {
      ...(page && pageSize && { skip: (page - 1) * pageSize, take: pageSize }),
      where,
    }

    const [list, count] = await Promise.all([
      prisma.media.findMany(queryParams),
      prisma.media.count({ where }),
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

    const { mediaId } = await idParamMediaValidator.validate(params)

    // 判断是否有权限查看该媒体库
    if (!isAdmin && !mediaPermissons.some((item) => item.mediaId === mediaId)) {
      return response
        .status(403)
        .json(new SResponse({ code: 403, message: '无权限查看', status: 'no permission' }))
    }
    const media = await prisma.media.findUnique({ where: { mediaId } })
    const showResponse = new SResponse({ code: 0, message: '', data: media })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const insertData = await createMediaValidator.validate(request.all())

    let media = null
    media = await prisma.media.findFirst({
      where: { mediaName: insertData.mediaName },
    })

    // 如果存在媒体库则取消删除标识
    if (media) {
      await prisma.media.update({
        where: { mediaId: media.mediaId },
        data: { deleteFlag: 0 },
      })
    } else {
      media = await prisma.media.create({
        data: insertData as any,
      })
    }

    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: media })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaId } = await idParamMediaValidator.validate(params)
    const modifyData = await updateMediaValidator.validate(request.all())
    const media = await prisma.media.update({
      where: { mediaId },
      data: modifyData as any,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: media })
    return response.json(updateResponse)
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaId } = await idParamMediaValidator.validate(params)
    const media = await prisma.media.update({ where: { mediaId }, data: { deleteFlag: 1 } })

    await addTask({
      taskName: `delete_media_${media.mediaId}`,
      command: 'deleteMedia',
      args: { mediaId: media.mediaId },
      priority: TaskPriority.deleteManga,
    })

    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: media })
    return response.json(destroyResponse)
  }

  public async destroy_batch({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaIds } = await batchIdsMediaValidator.validate(request.all())

    for (const mediaId of mediaIds) {
      const media = await prisma.media.update({ where: { mediaId }, data: { deleteFlag: 1 } })

      await addTask({
        taskName: `delete_media_${media.mediaId}`,
        command: 'deleteMedia',
        args: { mediaId: media.mediaId },
        priority: TaskPriority.deleteManga,
      })
    }

    const destroyResponse = new SResponse({ code: SResponseCode.Success, message: '删除成功' })
    return response.json(destroyResponse)
  }

  public async poster({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaId } = await idParamMediaValidator.validate(params)
    const posterFile = await new CreateMediaPosterJob({ mediaId }).run()
    const posterResponse = new SResponse({
      code: SResponseCode.Success,
      message: '生成成功',
      data: posterFile,
    })
    if (posterResponse) {
      return response.json(posterResponse)
    } else {
      return response
        .status(500)
        .json(new SResponse({ code: SResponseCode.Failed, message: '生成封面失败' }))
    }
  }

  public async scan({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaId } = await idParamMediaValidator.validate(params)
    const paths = await prisma.path.findMany({
      where: { mediaId, deleteFlag: 0 },
    })

    for (const p of paths) {
      await addTask({
        taskName: `scan_path_${p.pathId}`,
        command: 'taskScanPath',
        args: { pathId: p.pathId },
        priority: TaskPriority.scan,
      })
    }

    const scanResponse = new SResponse({ code: 0, message: '已加入扫描队列' })
    return response.json(scanResponse)
  }
}
