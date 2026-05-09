import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { Prisma } from '@prisma/client'
import {
  listLogValidator,
  idParamLogValidator,
  createLogValidator,
  updateLogValidator,
} from '#validators/log'

export default class LogsController {
  public async index({ request, response }: HttpContext) {
    const { page, pageSize } = await listLogValidator.validate(request.qs())
    const queryParams = {
      ...(page && {
        skip: (page - 1) * (pageSize ?? 10),
        take: pageSize ?? 10,
      }),
      orderBy: {
        createTime: Prisma.SortOrder.desc,
      },
    }
    const [list, count] = await Promise.all([prisma.log.findMany(queryParams), prisma.log.count()])
    const listResponse = new ListResponse({ code: 0, message: '', list, count })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    const { logId } = await idParamLogValidator.validate(params)
    const log = await prisma.log.findUnique({ where: { logId } })
    const showResponse = new SResponse({ code: 0, message: '', data: log })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = await createLogValidator.validate(request.all())
    const log = await prisma.log.create({
      data: insertData as any,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: log })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { logId } = await idParamLogValidator.validate(params)
    const modifyData = await updateLogValidator.validate(request.all())
    const log = await prisma.log.update({
      where: { logId },
      data: modifyData as any,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: log })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    const { logId } = await idParamLogValidator.validate(params)
    const log = await prisma.log.delete({ where: { logId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: log })
    return response.json(destroyResponse)
  }
}
