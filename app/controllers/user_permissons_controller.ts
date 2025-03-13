/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-10 01:15:48
 * @FilePath: \smanga-adonis\app\controllers\user_permissons_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { Prisma } from '@prisma/client'

export default class UserPermissonsController {
  public async index({ response }: HttpContext) {
    const list = await prisma.userPermisson.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { userPermissonId } = params
    userPermissonId = Number(userPermissonId)
    const userPermisson = await prisma.userPermisson.findUnique({
      where: { userPermissonId: userPermissonId },
    })
    const showResponse = new SResponse({ code: 0, message: '', data: userPermisson })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = request.body() as Prisma.userPermissonCreateInput
    const userPermisson = await prisma.userPermisson.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: userPermisson })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { userPermissonId } = params
    userPermissonId = Number(userPermissonId)
    const modifyData = request.only(['userId', 'permissonId']) as Prisma.userPermissonUpdateInput
    const userPermisson = await prisma.userPermisson.update({
      where: { userPermissonId: userPermissonId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: userPermisson })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { userPermissonId } = params
    userPermissonId = Number(userPermissonId)
    const userPermisson = await prisma.userPermisson.delete({
      where: { userPermissonId: userPermissonId },
    })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: userPermisson })
    return response.json(destroyResponse)
  }
}
