import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import {
  idParamScanValidator,
  createScanValidator,
  updateScanValidator,
} from '#validators/scan'

export default class ScansController {
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

    const list = await prisma.scan.findMany()
    return response.json({ code: 200, message: '', list, count: list.length })
  }

  public async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { scanId } = await idParamScanValidator.validate(params)
    const scan = await prisma.scan.findFirst({
      where: { scanId },
    })
    return response.json({ code: 200, message: '', data: scan })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const insertData = await createScanValidator.validate(request.all())
    const scan = await prisma.scan.create({
      data: insertData as any,
    })
    return response.json({ code: 200, message: '新增成功', data: scan })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { scanId } = await idParamScanValidator.validate(params)
    const modifyData = await updateScanValidator.validate(request.all())
    const scan = await prisma.scan.updateMany({
      where: { scanId },
      data: modifyData as any,
    })
    return response.json({ code: 200, message: '更新成功', data: scan })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { scanId } = await idParamScanValidator.validate(params)
    const scan = await prisma.scan.deleteMany({ where: { scanId } })
    return response.json({ code: 200, message: '删除成功', data: scan })
  }
}
