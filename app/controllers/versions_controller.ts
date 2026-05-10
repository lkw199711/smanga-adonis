import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import {
  idParamVersionValidator,
  createVersionValidator,
  updateVersionValidator,
} from '#validators/version'

export default class VersionsController {
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

    const list = await prisma.version.findMany()
    return response.json({ code: 200, message: '', list, count: list.length })
  }

  public async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { versionId } = await idParamVersionValidator.validate(params)
    const version = await prisma.version.findUnique({ where: { versionId } })
    return response.json({ code: 200, message: '', data: version })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const insertData = await createVersionValidator.validate(request.all())
    const version = await prisma.version.create({
      data: insertData as any,
    })
    return response.json({ code: 200, message: '新增成功', data: version })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { versionId } = await idParamVersionValidator.validate(params)
    const modifyData = await updateVersionValidator.validate(request.all())
    const version = await prisma.version.update({
      where: { versionId },
      data: modifyData as any,
    })
    return response.json({ code: 200, message: '更新成功', data: version })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { versionId } = await idParamVersionValidator.validate(params)
    const version = await prisma.version.delete({ where: { versionId } })
    return response.json({ code: 200, message: '删除成功', data: version })
  }
}
