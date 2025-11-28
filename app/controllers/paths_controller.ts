import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '#interfaces/response'
import { TaskPriority } from '#type/index'
import { addTask } from '#services/queue_service'
import { create_scan_cron } from '#services/cron_service'
import { delay } from '#utils/index'
import fs from 'fs'

export default class PathsController {
  public async index({ request, response }: HttpContext) {
    const { mediaId, page, pageSize } = request.only(['mediaId', 'page', 'pageSize'])
    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
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

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: count,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { pathId } = params
    pathId = Number(pathId)
    const path = await prisma.path.findUnique({ where: { pathId } })
    const showResponse = new SResponse({ code: 0, message: '', data: path })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    let path = null
    const insertData = request.only(['pathContent', 'mediaId', 'autoScan', 'include', 'exclude'])

    // 检查路径是否存在
    if (!fs.existsSync(insertData.pathContent)) {
      const saveResponse = new SResponse({ code: 1, message: '路径不存在', data: null })
      return response.json(saveResponse)
    }

    path = await prisma.path.findFirst({
      where: {
        pathContent: insertData.pathContent,
        mediaId: insertData.mediaId,
      },
    })

    if (!path) {
      path = await prisma.path.create({
        data: insertData,
      })
    } else if (path?.deleteFlag === 1) {
      await prisma.path.update({
        where: { pathId: path.pathId },
        data: { deleteFlag: 0 },
      })
    } else {
      const saveResponse = new SResponse({ code: 1, message: '路径已存在', data: path })
      return response.json(saveResponse)
    }

    // 添加自动扫描任务
    if (path.autoScan == 1) {
      create_scan_cron()
    }

    // 扫描路径
    addTask({
      taskName: `scan_path_${path.pathId}`,
      command: 'taskScanPath',
      args: { pathId: path.pathId },
      priority: TaskPriority.scan,
    })

    const saveResponse = new SResponse({ code: 0, message: '新增成功,扫描任务已提交', data: path })

    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { pathId } = params
    pathId = Number(pathId)
    const modifyData = request.only(['autoScan', 'include', 'exclude'])
    const path = await prisma.path.update({
      where: { pathId },
      data: modifyData,
    })

    // 如果路径被更新为自动扫描,则添加自动扫描任务
    if (modifyData.autoScan == 1) {
      create_scan_cron()
    }

    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: path })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { pathId } = params
    const path = await prisma.path.update({ where: { pathId }, data: { deleteFlag: 1 } })

    addTask({
      taskName: `delete_path_${path.pathId}`,
      command: 'deletePath',
      args: { pathId: path.pathId },
      priority: TaskPriority.delete,
    })

    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: path })
    return response.json(destroyResponse)
  }

  public async destroy_batch({ params, response }: HttpContext) {
    let { pathIds } = params
    pathIds = pathIds.split(',')
    const paths = await prisma.path.updateMany({
      where: {
        pathId: {
          in: pathIds.map((id: number) => Number(id)),
        },
      },
      data: { deleteFlag: 1 },
    })

    pathIds.forEach((id: number) => {
      addTask({
        taskName: `delete_path_${id}`,
        command: 'deletePath',
        args: { pathId: Number(id) },
        priority: TaskPriority.delete,
      })
    })

    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: paths })
    return response.json(destroyResponse)
  }

  public async scan({ params, response }: HttpContext) {
    let { pathId } = params

    addTask({
      taskName: `scan_path_${pathId}`,
      command: 'taskScanPath',
      args: { pathId },
      priority: TaskPriority.scan,
    })

    const scanResponse = new SResponse({ code: 0, message: '扫描任务已提交', data: { pathId } })
    return response.json(scanResponse)
  }

  public async re_scan({ params, response }: HttpContext) {
    let { pathId } = params
    const mangas = await prisma.manga.findMany({ where: { pathId } })
    // 删除此路径现有漫画
    for (let index = 0; index < mangas.length; index++) {
      const manga = mangas[index]

      addTask({
        taskName: `delete_manga_${manga.mangaId}`,
        command: 'deleteManga',
        args: { mangaId: manga.mangaId },
        priority: TaskPriority.deleteManga,
      })
    }

    // 等待任务添加完毕
    await delay(1000 * 10)

    // 再次扫描路径
    addTask({
      taskName: `scan_path_${pathId}`,
      command: 'taskScanPath',
      args: { pathId },
      priority: TaskPriority.scan,
    })

    const scanResponse = new SResponse({ code: 0, message: '重新扫描任务已提交', data: pathId })
    return response.json(scanResponse)
  }
}
