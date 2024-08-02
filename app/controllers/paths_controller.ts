/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:21:48
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-07-30 18:37:20
 * @FilePath: \smanga-adonis\app\controllers\paths_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'
import { TaskPriority } from '../../type/index.js'

export default class PathsController {
  public async index({ response }: HttpContext) {
    const list = await prisma.path.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
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
    const requestParams = request.body()
    const insertData = requestParams.data as Prisma.pathCreateInput
    const path = await prisma.path.create({
      data: insertData,
    })

    // 新增扫描任务
    await prisma.task.create({
      data: {
        taskName: `scan_${path.pathId}`,
        priority: TaskPriority.scan,
        command: 'task_scan',
        args: { pathId: path.pathId },
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
        command: 'task_scan',
        args: { pathId },
        status: 'pending',
      },
    })
    
    const scanResponse = new SResponse({ code: 0, message: '扫描任务已提交', data: task })
    return response.json(scanResponse)
  }
}
