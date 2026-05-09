import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import {
  idParamMediaPermissonValidator,
  createMediaPermissonValidator,
  updateMediaPermissonValidator,
} from '#validators/media_permisson'

export default class MediaPermissonsController {
  public async index({ response }: HttpContext) {
    const list = await prisma.mediaPermisson.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    const { mediaPermissonId } = await idParamMediaPermissonValidator.validate(params)
    const mediaPermisson = await prisma.mediaPermisson.findUnique({ where: { mediaPermissonId } })
    const showResponse = new SResponse({ code: 0, message: '', data: mediaPermisson })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = await createMediaPermissonValidator.validate(request.all())
    const mediaPermisson = await prisma.mediaPermisson.create({
      data: insertData as any,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: mediaPermisson })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { mediaPermissonId } = await idParamMediaPermissonValidator.validate(params)
    const modifyData = await updateMediaPermissonValidator.validate(request.all())
    const mediaPermisson = await prisma.mediaPermisson.update({
      where: { mediaPermissonId },
      data: modifyData as any,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: mediaPermisson })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    const { mediaPermissonId } = await idParamMediaPermissonValidator.validate(params)
    const mediaPermisson = await prisma.mediaPermisson.delete({ where: { mediaPermissonId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: mediaPermisson })
    return response.json(destroyResponse)
  }
}
