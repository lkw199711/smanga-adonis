import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import {
  idParamTokenValidator,
  createTokenValidator,
  updateTokenValidator,
} from '#validators/token'

export default class TokensController {
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

    const list = await prisma.token.findMany()
    return response.json({ code: 200, message: '', list, count: list.length })
  }

  public async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { tokenId } = await idParamTokenValidator.validate(params)
    const token = await prisma.token.findUnique({ where: { tokenId } })
    return response.json({ code: 200, message: '', data: token })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const insertData = await createTokenValidator.validate(request.all())
    const token = await prisma.token.create({
      data: insertData as any,
    })
    return response.json({ code: 200, message: '新增成功', data: token })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { tokenId } = await idParamTokenValidator.validate(params)
    const modifyData = await updateTokenValidator.validate(request.all())
    const token = await prisma.token.update({
      where: { tokenId },
      data: modifyData as any,
    })
    return response.json({ code: 200, message: '更新成功', data: token })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { tokenId } = await idParamTokenValidator.validate(params)
    const token = await prisma.token.delete({ where: { tokenId } })
    return response.json({ code: 200, message: '删除成功', data: token })
  }
}
