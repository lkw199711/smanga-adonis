import type { HttpContext } from '@adonisjs/core/http'
import { ListResponse, SResponse } from '../interfaces/response.js'
import prisma from '#start/prisma'
import { addTask } from '#services/queue_service'
import { TaskPriority } from '#type/index'
import * as fs from 'fs'
import {
  listSyncValidator,
  idParamSyncValidator,
  createSyncValidator,
  updateSyncValidator,
  batchIdsParamSyncValidator,
} from '#validators/sync'

export default class SyncsController {
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

  async select({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { page, pageSize } = await listSyncValidator.validate(request.qs())
    const queryParams = {
      orderBy: { createTime: 'desc' as const },
      ...(page && {
        skip: (page - 1) * (pageSize ?? 10),
        take: pageSize ?? 10,
      }),
    }

    const [list, count] = await Promise.all([
      prisma.sync.findMany(queryParams),
      prisma.sync.count(),
    ])

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })

    return response.json(listResponse)
  }

  async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const payload = await createSyncValidator.validate(request.all())
    const { syncType, syncName, origin, receivedPath, shareId, link, secret, auto, token } = payload

    // 接收路径存在性
    if (fs.existsSync(receivedPath) === false) {
      return response
        .status(400)
        .json(new SResponse({ code: 1, message: '接收路径不存在', status: 'bad request' }))
    }

    // 路径无法写入
    try {
      fs.accessSync(receivedPath, fs.constants.W_OK)
    } catch (err) {
      return response.status(400).json(
        new SResponse({
          code: 1,
          message: '接收路径无法写入，请检查权限',
          status: 'bad request',
        })
      )
    }

    let sync = await prisma.sync.findFirst({ where: { link } })
    if (sync) {
      // 保留原注释,此处不作阻断
    }

    let originWithApi = origin
    if (link && /\/api/.test(link)) originWithApi = (origin ?? '') + '/api'

    sync = await prisma.sync.create({
      data: {
        syncType,
        syncName,
        origin: originWithApi,
        receivedPath,
        shareId,
        link,
        secret,
        auto: auto ? 1 : 0, // 将布尔值转换为整数
        token,
      } as any,
    })

    if (!sync) {
      return response
        .status(500)
        .json(new SResponse({ code: 1, message: '同步任务创建失败', status: 'error' }))
    }

    if (syncType === 'media') {
      await addTask({
        taskName: 'sync_media_' + sync.syncId,
        command: 'taskSyncMedia',
        args: { receivedPath, link, origin: originWithApi },
        priority: TaskPriority.syncMedia,
      })
    } else {
      await addTask({
        taskName: 'sync_manga_' + sync.syncId,
        command: 'taskSyncManga',
        args: { receivedPath, link, origin: originWithApi },
        priority: TaskPriority.syncManga,
      })
    }

    return response.json(new SResponse({ code: 0, message: '同步任务创建成功', data: sync }))
  }

  async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { syncId } = await idParamSyncValidator.validate(params)
    const { syncType, origin, shareId, link, secret, auto, token } =
      await updateSyncValidator.validate(request.all())

    const sync = await prisma.sync.update({
      where: { syncId },
      data: {
        syncType,
        origin,
        shareId,
        link,
        secret,
        auto: auto ? 1 : 0,
        token,
      },
    })

    if (!sync) {
      return response
        .status(404)
        .json(new SResponse({ code: 1, message: '同步任务未找到', status: 'not found' }))
    }

    return response.json(new SResponse({ code: 0, message: '同步任务更新成功', data: sync }))
  }

  async execute({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { syncId } = await idParamSyncValidator.validate(params)
    const sync = await prisma.sync.findUnique({ where: { syncId } })

    if (!sync) {
      return response
        .status(404)
        .json(new SResponse({ code: 1, message: '同步记录未找到', status: 'not found' }))
    }

    if (sync.syncType === 'media') {
      await addTask({
        taskName: 'sync_media_' + sync.syncId,
        command: 'taskSyncMedia',
        args: { receivedPath: sync.receivedPath, link: sync.link, origin: sync.origin },
        priority: TaskPriority.syncMedia,
      })
    } else {
      await addTask({
        taskName: 'sync_manga_' + sync.syncId,
        command: 'taskSyncManga',
        args: { receivedPath: sync.receivedPath, link: sync.link, origin: sync.origin },
        priority: TaskPriority.syncManga,
      })
    }

    return response.json(new SResponse({ code: 0, message: '同步任务已加入队列', data: sync }))
  }

  async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { syncId } = await idParamSyncValidator.validate(params)
    const sync = await prisma.sync.delete({ where: { syncId } })

    if (!sync) {
      return response
        .status(404)
        .json(new SResponse({ code: 1, message: '同步记录未找到', status: 'not found' }))
    }

    return response.json(new SResponse({ code: 0, message: '同步记录删除成功', data: sync }))
  }

  async destroy_batch({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { syncIds } = await batchIdsParamSyncValidator.validate(params)
    await prisma.sync.deleteMany({
      where: { syncId: { in: syncIds } },
    })
    return response.json(new SResponse({ code: 0, message: '同步记录删除成功', status: 'success' }))
  }
}
