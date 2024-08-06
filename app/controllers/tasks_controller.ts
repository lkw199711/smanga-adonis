/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:22:21
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-06 00:24:39
 * @FilePath: \smanga-adonis\app\controllers\tasks_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { Prisma } from '@prisma/client'

export default class TasksController {
  public async index({ request, response }: HttpContext) {
    const { page, pageSize } = request.only(['page', 'pageSize'])
    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    }
    const [list, count] = await Promise.all([
      prisma.task.findMany(queryParams),
      prisma.task.count(),
    ])
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { taskId } = params
    taskId = Number(taskId)
    const task = await prisma.task.findUnique({ where: { taskId } })
    const showResponse = new SResponse({ code: 0, message: '', data: task })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = request.body() as Prisma.taskCreateInput
    const task = await prisma.task.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: task })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { taskId } = params
    taskId = Number(taskId)
    const modifyData = request.body()
    const task = await prisma.task.update({
      where: { taskId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: task })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { taskId } = params
    taskId = Number(taskId)
    const task = await prisma.task.delete({ where: { taskId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: task })
    return response.json(destroyResponse)
  }
}
