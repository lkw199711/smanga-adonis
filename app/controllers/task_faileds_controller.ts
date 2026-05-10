import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import {
  idParamTaskFailedValidator,
  createTaskFailedValidator,
  updateTaskFailedValidator,
} from '#validators/task_failed'

export default class TaskFailedsController {
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

    const list = await prisma.taskFailed.findMany()
    return response.json({ code: 200, message: '', list, count: list.length })
  }

  public async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { taskFailedId } = await idParamTaskFailedValidator.validate(params)
    const taskFailed = await prisma.taskFailed.findUnique({ where: { taskId: taskFailedId } })
    return response.json({ code: 200, message: '', data: taskFailed })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const insertData = await createTaskFailedValidator.validate(request.all())
    const taskFailed = await prisma.taskFailed.create({
      data: insertData as any,
    })
    return response.json({ code: 200, message: '新增成功', data: taskFailed })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { taskFailedId } = await idParamTaskFailedValidator.validate(params)
    const modifyData = await updateTaskFailedValidator.validate(request.all())
    const taskFailed = await prisma.taskFailed.update({
      where: { taskId: taskFailedId },
      data: modifyData as any,
    })
    return response.json({ code: 200, message: '更新成功', data: taskFailed })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { taskFailedId } = await idParamTaskFailedValidator.validate(params)
    const taskFailed = await prisma.taskFailed.delete({ where: { taskId: taskFailedId } })
    return response.json({ code: 200, message: '删除成功', data: taskFailed })
  }
}
