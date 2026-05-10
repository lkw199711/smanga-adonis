import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import {
  idParamMetaValidator,
  createMetaValidator,
  updateMetaValidator,
} from '#validators/meta'

export default class MetasController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  public async index({ response }: HttpContext) {
    const list = await prisma.meta.findMany()
    return response.json({ code: 200, message: '', list, count: list.length })
  }

  public async show({ params, response }: HttpContext) {
    const { metaId } = await idParamMetaValidator.validate(params)
    const meta = await prisma.meta.findUnique({ where: { metaId } })
    return response.json({ code: 200, message: '', data: meta })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const insertData = await createMetaValidator.validate(request.all())
    const meta = await prisma.meta.create({
      data: insertData as any,
    })
    return response.json({ code: 200, message: '新增成功', data: meta })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { metaId } = await idParamMetaValidator.validate(params)
    const modifyData = await updateMetaValidator.validate(request.all())
    const meta = await prisma.meta.update({
      where: { metaId },
      data: modifyData as any,
    })
    return response.json({ code: 200, message: '更新成功', data: meta })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { metaId } = await idParamMetaValidator.validate(params)
    const meta = await prisma.meta.delete({ where: { metaId } })
    return response.json({ code: 200, message: '删除成功', data: meta })
  }
}
