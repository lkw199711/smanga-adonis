/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:21:48
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-01-17 23:46:54
 * @FilePath: \smanga-adonis\app\controllers\paths_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { TaskPriority } from '../type/index.js'
import { scanQueue } from '#services/queue_service'

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
    const insertData = request.only(['pathContent', 'mediaId', 'autoScan', 'include', 'exclude'])
    const path = await prisma.path.create({
      data: insertData,
    })

    scanQueue.add({
      taskName: `scan_${path.pathId}`,
      command: 'taskScan',
      args: { pathId: path.pathId }
    }, {
      priority: TaskPriority.scan
    })

    const saveResponse = new SResponse({ code: 0, message: '新增成功,扫描任务已提交', data: path })

    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { pathId } = params
    pathId = Number(pathId)
    const modifyData = request.body()
    const path = await prisma.path.update({
      where: { pathId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: path })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { pathId } = params
    const path = await prisma.path.update({ where: { pathId }, data: { deleteFlag: 1 } })

    scanQueue.add({
      taskName: `delete_path_${path.pathId}`,
      command: 'deletePath',
      args: { pathId: path.pathId }
    }, {
      priority: TaskPriority.delete
    })

    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: path })
    return response.json(destroyResponse)
  }

  public async scan({ params, response }: HttpContext) {
    let { pathId } = params

    scanQueue.add({
      taskName: `scan_${pathId}`,
      command: 'taskScan',
      args: { pathId }
    }, {
      priority: TaskPriority.scan
    })

    const scanResponse = new SResponse({ code: 0, message: '扫描任务已提交', data: { pathId } })
    return response.json(scanResponse)
  }

  public async re_scan({ params, response }: HttpContext) {
    let { pathId } = params
    const mangas = await prisma.manga.findMany({ where: { pathId } })
    // 添加删除任务
    mangas.forEach(async (manga) => { 
      scanQueue.add({
        taskName: `delete_manga_${manga.mangaId}`,
        command: 'deleteManga',
        args: { mangaId: manga.mangaId }
      }, {
        priority: TaskPriority.deleteManga
      })

    })

    scanQueue.add({
      taskName: `re_scan_${pathId}`,
      command: 'taskScan',
      args: { pathId }
    }, {
      priority: TaskPriority.scan
    })

    const scanResponse = new SResponse({ code: 0, message: '重新扫描任务已提交', data: pathId })
    return response.json(scanResponse)
  }
}
