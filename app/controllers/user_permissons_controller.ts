import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class UserPermissonsController {
  public async index({ response }: HttpContext) {
    const list = await prisma.user_permisson.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { user_permissonId } = params
    user_permissonId = Number(user_permissonId)
    const user_permisson = await prisma.user_permisson.findUnique({
      where: { userPermissonId: user_permissonId },
    })
    const showResponse = new SResponse({ code: 0, message: '', data: user_permisson })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = request.body() as Prisma.user_permissonCreateInput
    const user_permisson = await prisma.user_permisson.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: user_permisson })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { user_permissonId } = params
    user_permissonId = Number(user_permissonId)
    const modifyData = request.body()
    const user_permisson = await prisma.user_permisson.update({
      where: { userPermissonId: user_permissonId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: user_permisson })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { user_permissonId } = params
    user_permissonId = Number(user_permissonId)
    const user_permisson = await prisma.user_permisson.delete({
      where: { userPermissonId: user_permissonId },
    })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: user_permisson })
    return response.json(destroyResponse)
  }
}
