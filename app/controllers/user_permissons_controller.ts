import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import {
  idParamUserPermissonValidator,
  createUserPermissonValidator,
  updateUserPermissonValidator,
} from '#validators/user_permisson'

export default class UserPermissonsController {
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

    const list = await prisma.userPermisson.findMany()
    return response.json({ code: 200, message: '', list, count: list.length })
  }

  public async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { userPermissonId } = await idParamUserPermissonValidator.validate(params)
    const userPermisson = await prisma.userPermisson.findUnique({
      where: { userPermissonId },
    })
    return response.json({ code: 200, message: '', data: userPermisson })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const insertData = await createUserPermissonValidator.validate(request.all())
    const userPermisson = await prisma.userPermisson.create({
      data: insertData as any,
    })
    return response.json({ code: 200, message: '新增成功', data: userPermisson })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { userPermissonId } = await idParamUserPermissonValidator.validate(params)
    const modifyData = await updateUserPermissonValidator.validate(request.all())
    const userPermisson = await prisma.userPermisson.update({
      where: { userPermissonId },
      data: modifyData as any,
    })
    return response.json({ code: 200, message: '更新成功', data: userPermisson })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { userPermissonId } = await idParamUserPermissonValidator.validate(params)
    const userPermisson = await prisma.userPermisson.delete({
      where: { userPermissonId },
    })
    return response.json({ code: 200, message: '删除成功', data: userPermisson })
  }
}
