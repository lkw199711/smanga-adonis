import type { HttpContext } from '@adonisjs/core/http'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { scanQueue } from '#services/queue_service'
import { idParamTaskValidator, batchIdsParamTaskValidator } from '#validators/task'

export default class TasksController {
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

  async select({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const list = await scanQueue.getJobs(['active', 'waiting'])
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { taskId } = await idParamTaskValidator.validate(params)
    const job = await scanQueue.getJob(taskId)

    if (!job) {
      return response.status(404).json(new SResponse({ code: 1, message: '任务未找到', status: 'not found' }))
    }

    return response.json(new SResponse({ code: 0, message: '', data: job }))
  }

  async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { taskId } = await idParamTaskValidator.validate(params)
    const job = await scanQueue.getJob(taskId)

    if (!job) {
      return response.status(404).json(new SResponse({ code: 1, message: '任务未找到', status: 'not found' }))
    }

    await job.remove()
    return response.json(new SResponse({ code: 0, message: '任务已删除', status: 'success' }))
  }

  async destroy_batch({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { taskIds } = await batchIdsParamTaskValidator.validate(params)
    for (const taskId of taskIds) {
      const job = await scanQueue.getJob(taskId)
      if (job) await job.remove()
    }
    return response.json(new SResponse({ code: 0, message: '任务已删除', status: 'success' }))
  }

  async destroy_all({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    await scanQueue.clean(0)
    return response.json(new SResponse({ code: 0, message: '任务已清空', status: 'success' }))
  }
}
