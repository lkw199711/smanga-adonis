import type { HttpContext } from '@adonisjs/core/http'
import { scanQueue } from '#services/queue_service'
import {
  cleanJobs, listFailedJobs, removeJob, retryFailedJob,
} from '#services/queue/sql_queue_repository'
import { idParamTaskValidator, batchIdsParamTaskValidator } from '#validators/task'

export default class TasksController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (user?.role !== 'admin') {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  async select({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const list = await scanQueue.getJobs(['active', 'waiting'])
    return response.json({ code: 200, message: '', list, count: list.length })
  }

  async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { taskId } = await idParamTaskValidator.validate(params)
    const job = await scanQueue.getJob(taskId)

    if (!job) {
      return response.status(404).json({ code: 404, message: '任务未找到', status: 'not found' })
    }

    return response.json({ code: 200, message: '', data: job })
  }

  async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { taskId } = await idParamTaskValidator.validate(params)
    const job = await scanQueue.getJob(taskId)

    if (!job) {
      return response.status(404).json({ code: 404, message: '任务未找到', status: 'not found' })
    }

    if (!(await removeJob(taskId))) {
      return response.status(409).json({ code: 409, message: '任务已开始执行或属于永久清理' })
    }
    return response.json({ code: 200, message: '任务已删除', status: 'success' })
  }

  async destroy_batch({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { taskIds } = await batchIdsParamTaskValidator.validate(params)
    const removed: number[] = []
    const skipped: number[] = []
    for (const taskId of taskIds) {
      const result = await removeJob(taskId)
      const ids = result ? removed : skipped
      ids.push(taskId)
    }
    return response.json({ code: 200, data: { removed, skipped } })
  }

  async destroy_all({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const count = await cleanJobs()
    const message = count > 0 ? `已清空 ${count} 个待执行任务` : '没有可清空的待执行任务'
    return response.json({ code: 200, message, count })
  }

  async failed({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return
    const list = await listFailedJobs()
    return response.json({ code: 200, list, count: list.length })
  }

  async retry({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return
    const { taskId } = await idParamTaskValidator.validate(params)
    const job = await retryFailedJob(taskId)
    if (!job) return response.status(404).json({ code: 404, message: '失败任务不存在' })
    if (job === 'conflict') {
      return response.status(409).json({ code: 409, message: '上级或下级记录已有永久清理任务' })
    }
    if (job === 'migrationConflict') {
      return response.status(409).json({ code: 409, message: '已有目录冲突的迁移任务在队列中' })
    }
    return response.status(202).json({ code: 200, message: '任务已重新入队', data: job })
  }
}
