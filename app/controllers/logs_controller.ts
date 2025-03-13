/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-10-08 15:36:23
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-03-13 22:39:54
 * @FilePath: \smanga-adonis\app\controllers\logs_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { Prisma } from '@prisma/client'

export default class LogsController {
  public async index({ request, response }: HttpContext) {
    const { page, pageSize } = request.only(['page', 'pageSize', 'order'])
    const queryParams = {
      skip: (page - 1) * pageSize,
      take: pageSize,
      // orderBy: order_params(order),
    }
    const [list, count] = await Promise.all([prisma.log.findMany(queryParams), prisma.log.count()])
    const listResponse = new ListResponse({ code: 0, message: '', list, count })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { logId } = params
    logId = Number(logId)
    const log = await prisma.log.findUnique({ where: { logId } })
    const showResponse = new SResponse({ code: 0, message: '', data: log })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = request.body() as Prisma.logCreateInput
    const log = await prisma.log.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: log })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { logId } = params
    logId = Number(logId)
    const modifyData = request.only(['logContent']) as Prisma.logUpdateInput
    const log = await prisma.log.update({
      where: { logId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: log })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { logId } = params
    logId = Number(logId)
    const log = await prisma.log.delete({ where: { logId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: log })
    return response.json(destroyResponse)
  }
}
