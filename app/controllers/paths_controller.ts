/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:21:48
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-11 14:24:42
 * @FilePath: \smanga-adonis\app\controllers\paths_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { TaskPriority } from '../type/index.js'
import { sql_stringify_json } from '../utils/index.js'

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

    // 新增扫描任务
    await prisma.task.create({
      data: {
        taskName: `scan_${path.pathId}`,
        priority: TaskPriority.scan,
        command: 'taskScan',
        args: sql_stringify_json({ pathId: path.pathId }) as string,
        status: 'pending',
      },
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
    await prisma.task.create({
      data: {
        taskName: `delete_path_${path.pathId}`,
        command: 'deletePath',
        priority: TaskPriority.delete,
        args: sql_stringify_json({ pathId: path.pathId }) as string,
        status: 'pending',
      },
    })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: path })
    return response.json(destroyResponse)
  }

  public async scan({ params, response }: HttpContext) {
    let { pathId } = params
    const task = await prisma.task.create({
      data: {
        taskName: `scan_${pathId}`,
        priority: TaskPriority.scan,
        command: 'taskScan',
        args: sql_stringify_json({ pathId }) as string,
        status: 'pending',
      },
    })

    const scanResponse = new SResponse({ code: 0, message: '扫描任务已提交', data: task })
    return response.json(scanResponse)
  }

  public async re_scan({ params, response }: HttpContext) {
    let { pathId } = params
    const mangas = await prisma.manga.findMany({ where: { pathId } })
    // 添加删除任务
    mangas.forEach(async (manga) => { 
      await prisma.task.create({
        data: {
          taskName: `delete_manga_${manga.mangaId}`,
          command: 'deleteManga',
          priority: TaskPriority.deleteManga,
          args: sql_stringify_json({ mangaId: manga.mangaId }) as string,
          status: 'pending',
        },
      })
    })
    // 添加扫描任务
    const task = await prisma.task.create({
      data: {
        taskName: `re_scan_${pathId}`,
        priority: TaskPriority.scan,
        command: 'taskScan',
        args: sql_stringify_json({ pathId }) as string,
        status: 'pending',
      },
    })

    const scanResponse = new SResponse({ code: 0, message: '重新扫描任务已提交', data: task })
    return response.json(scanResponse)
  }
}
