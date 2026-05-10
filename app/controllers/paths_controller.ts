import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { TaskPriority } from '#type/index'
import { addTask } from '#services/queue_service'
import { create_scan_cron } from '#services/cron_service'
import fs from 'fs'
import {
  listPathValidator,
  idParamPathValidator,
  createPathValidator,
  updatePathValidator,
  batchIdsParamPathValidator,
} from '#validators/path'

export default class PathsController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  public async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaId, page, pageSize } = await listPathValidator.validate(request.qs())
    const queryParams = {
      ...(page && {
        skip: (page - 1) * (pageSize ?? 10),
        take: pageSize ?? 10,
      }),
      where: {
        ...(mediaId && { mediaId }),
        deleteFlag: 0,
      },
    }

    const [list, count] = await Promise.all([
      prisma.path.findMany(queryParams),
      prisma.path.count({ where: queryParams.where }),
    ])

    return response.json({ code: 200, message: '', list, count })
  }

  public async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathId } = await idParamPathValidator.validate(params)
    const path = await prisma.path.findUnique({ where: { pathId } })
    return response.json({ code: 200, message: '', data: path })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    let path = null
    const insertData = await createPathValidator.validate(request.all())

    // 检查路径是否存在
    if (!fs.existsSync(insertData.pathContent)) {
      return response.status(400).json({ code: 400, message: '路径不存在', data: null })
    }

    path = await prisma.path.findFirst({
      where: {
        pathContent: insertData.pathContent,
        mediaId: insertData.mediaId,
      },
    })

    if (!path) {
      path = await prisma.path.create({
        data: insertData as any,
      })
    } else if (path?.deleteFlag === 1) {
      await prisma.path.update({
        where: { pathId: path.pathId },
        data: { deleteFlag: 0 },
      })
    } else {
      return response.status(400).json({ code: 400, message: '路径已存在', data: path })
    }

    // 添加自动扫描任务
    if (path.autoScan == 1) {
      create_scan_cron()
    }

    // 扫描路径
    await addTask({
      taskName: `scan_path_${path.pathId}`,
      command: 'taskScanPath',
      args: { pathId: path.pathId },
      priority: TaskPriority.scan,
    })

    return response.json({ code: 200, message: '新增成功,扫描任务已提交', data: path })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathId } = await idParamPathValidator.validate(params)
    const modifyData = await updatePathValidator.validate(request.all())
    const path = await prisma.path.update({
      where: { pathId },
      data: modifyData,
    })

    // 如果路径被更新为自动扫描,则添加自动扫描任务
    if (modifyData.autoScan == 1) {
      create_scan_cron()
    }

    return response.json({ code: 200, message: '更新成功', data: path })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathId } = await idParamPathValidator.validate(params)
    const path = await prisma.path.update({ where: { pathId }, data: { deleteFlag: 1 } })

    await addTask({
      taskName: `delete_path_${path.pathId}`,
      command: 'deletePath',
      args: { pathId: path.pathId },
      priority: TaskPriority.delete,
    })

    return response.json({ code: 200, message: '删除成功', data: path })
  }

  public async destroy_batch({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathIds } = await batchIdsParamPathValidator.validate(params)
    const paths = await prisma.path.updateMany({
      where: { pathId: { in: pathIds } },
      data: { deleteFlag: 1 },
    })

    for (const id of pathIds) {
      await addTask({
        taskName: `delete_path_${id}`,
        command: 'deletePath',
        args: { pathId: id },
        priority: TaskPriority.delete,
      })
    }

    return response.json({ code: 200, message: '删除成功', data: paths })
  }

  public async scan({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathId } = await idParamPathValidator.validate(params)

    await addTask({
      taskName: `scan_path_${pathId}`,
      command: 'taskScanPath',
      args: { pathId },
      priority: TaskPriority.scan,
    })

    return response.json({ code: 200, message: '扫描任务已提交', data: { pathId } })
  }

  public async re_scan({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathId } = await idParamPathValidator.validate(params)
    const mangas = await prisma.manga.findMany({ where: { pathId } })
    // 删除此路径现有漫画
    for (const manga of mangas) {
      await addTask({
        taskName: `delete_manga_${manga.mangaId}`,
        command: 'deleteManga',
        args: { mangaId: manga.mangaId },
        priority: TaskPriority.deleteManga,
      })
    }

    // 再次扫描路径
    await addTask({
      taskName: `scan_path_${pathId}`,
      command: 'taskScanPath',
      args: { pathId },
      priority: TaskPriority.scan,
    })

    return response.json({ code: 200, message: '重新扫描任务已提交', data: pathId })
  }
}
