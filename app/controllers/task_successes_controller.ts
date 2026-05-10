import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import {
  idParamTaskSuccessValidator,
  createTaskSuccessValidator,
  updateTaskSuccessValidator,
} from '#validators/task_success'

export default class TaskSuccessesController {
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

    const list = await prisma.taskSuccess.findMany()
    return response.json({ code: 200, message: '', list, count: list.length })
  }

  public async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { taskSuccessId } = await idParamTaskSuccessValidator.validate(params)
    const taskSuccess = await prisma.taskSuccess.findUnique({ where: { taskId: taskSuccessId } })
    return response.json({ code: 200, message: '', data: taskSuccess })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const insertData = await createTaskSuccessValidator.validate(request.all())
    const taskSuccess = await prisma.taskSuccess.create({
      data: insertData as any,
    })
    return response.json({ code: 200, message: '新增成功', data: taskSuccess })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { taskSuccessId } = await idParamTaskSuccessValidator.validate(params)
    const modifyData = await updateTaskSuccessValidator.validate(request.all())
    const taskSuccess = await prisma.taskSuccess.update({
      where: { taskId: taskSuccessId },
      data: modifyData as any,
    })
    return response.json({ code: 200, message: '更新成功', data: taskSuccess })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { taskSuccessId } = await idParamTaskSuccessValidator.validate(params)
    const taskSuccess = await prisma.taskSuccess.delete({ where: { taskId: taskSuccessId } })
    return response.json({ code: 200, message: '删除成功', data: taskSuccess })
  }
}
