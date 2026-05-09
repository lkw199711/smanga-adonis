import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import {
  idParamUserPermissonValidator,
  createUserPermissonValidator,
  updateUserPermissonValidator,
} from '#validators/user_permisson'

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
    const { userPermissonId } = await idParamUserPermissonValidator.validate(params)
    const userPermisson = await prisma.userPermisson.findUnique({
      where: { userPermissonId },
    })
    const showResponse = new SResponse({ code: 0, message: '', data: userPermisson })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = await createUserPermissonValidator.validate(request.all())
    const userPermisson = await prisma.userPermisson.create({
      data: insertData as any,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: userPermisson })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { userPermissonId } = await idParamUserPermissonValidator.validate(params)
    const modifyData = await updateUserPermissonValidator.validate(request.all())
    const userPermisson = await prisma.userPermisson.update({
      where: { userPermissonId },
      data: modifyData as any,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: userPermisson })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    const { userPermissonId } = await idParamUserPermissonValidator.validate(params)
    const userPermisson = await prisma.userPermisson.delete({
      where: { userPermissonId },
    })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: userPermisson })
    return response.json(destroyResponse)
  }
}
