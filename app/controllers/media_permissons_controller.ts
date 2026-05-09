import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import {
  idParamMediaPermissonValidator,
  createMediaPermissonValidator,
  updateMediaPermissonValidator,
} from '#validators/media_permisson'

export default class MediaPermissonsController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response
        .status(403)
        .json(new SResponse({ code: 403, message: '无权限', status: 'no permission' }))
      return false
    }
    return true
  }

  public async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const list = await prisma.mediaPermisson.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ request, params, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaPermissonId } = await idParamMediaPermissonValidator.validate(params)
    const mediaPermisson = await prisma.mediaPermisson.findUnique({ where: { mediaPermissonId } })
    const showResponse = new SResponse({ code: 0, message: '', data: mediaPermisson })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const insertData = await createMediaPermissonValidator.validate(request.all())
    const mediaPermisson = await prisma.mediaPermisson.create({
      data: insertData as any,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: mediaPermisson })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaPermissonId } = await idParamMediaPermissonValidator.validate(params)
    const modifyData = await updateMediaPermissonValidator.validate(request.all())
    const mediaPermisson = await prisma.mediaPermisson.update({
      where: { mediaPermissonId },
      data: modifyData as any,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: mediaPermisson })
    return response.json(updateResponse)
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaPermissonId } = await idParamMediaPermissonValidator.validate(params)
    const mediaPermisson = await prisma.mediaPermisson.delete({ where: { mediaPermissonId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: mediaPermisson })
    return response.json(destroyResponse)
  }
}
