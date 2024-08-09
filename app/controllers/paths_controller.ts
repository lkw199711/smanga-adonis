/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:21:48
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-09 17:49:54
 * @FilePath: \smanga-adonis\app\controllers\paths_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { Prisma } from '@prisma/client'
import { TaskPriority } from '../type/index.js'
import { sql_parse_json, sql_stringify_json } from '../utils/index.js'

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
    // let { pathId } = params
    // pathId = Number(pathId)
    // const path = await prisma.path.findUnique({ where: { pathId } })
    // const showResponse = new SResponse({ code: 0, message: '', data: path })
    // return response.json(showResponse)
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
    pathId = Number(pathId)
    const path = await prisma.path.delete({ where: { pathId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: path })
    return response.json(destroyResponse)
  }

  public async scan({ params, response }: HttpContext) {
    let { pathId } = params
    pathId = Number(pathId)

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
}
