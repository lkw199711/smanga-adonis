import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import {
  idParamMediaPermissonValidator,
  createMediaPermissonValidator,
  updateMediaPermissonValidator,
} from '#validators/media_permisson'

export default class MediaPermissonsController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  public async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const list = await prisma.mediaPermisson.findMany()
    return response.json({ code: 200, message: '', list, count: list.length })
  }

  public async show({ request, params, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaPermissonId } = await idParamMediaPermissonValidator.validate(params)
    const mediaPermisson = await prisma.mediaPermisson.findUnique({ where: { mediaPermissonId } })
    return response.json({ code: 200, message: '', data: mediaPermisson })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const insertData = await createMediaPermissonValidator.validate(request.all())
    const mediaPermisson = await prisma.mediaPermisson.create({
      data: insertData as any,
    })
    return response.json({ code: 200, message: '新增成功', data: mediaPermisson })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaPermissonId } = await idParamMediaPermissonValidator.validate(params)
    const modifyData = await updateMediaPermissonValidator.validate(request.all())
    const mediaPermisson = await prisma.mediaPermisson.update({
      where: { mediaPermissonId },
      data: modifyData as any,
    })
    return response.json({ code: 200, message: '更新成功', data: mediaPermisson })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaPermissonId } = await idParamMediaPermissonValidator.validate(params)
    const mediaPermisson = await prisma.mediaPermisson.delete({ where: { mediaPermissonId } })
    return response.json({ code: 200, message: '删除成功', data: mediaPermisson })
  }
}
