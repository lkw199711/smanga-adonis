import { createHash } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import { addTask } from '#services/queue_service'
import { checkDirectoryMigrationPaths, createMigrationTarget } from '#services/directory_migration_service'
import { createMigrationTargetValidator, directoryMigrationValidator } from '#validators/directory_migration'
import { TaskPriority } from '#type/index'

export default class SystemToolsController {
  private checkAdmin(request: any, response: any) {
    if (request.user?.role === 'admin') return true
    response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
    return false
  }

  async checkDirectoryMigration({ request, response }: HttpContext) {
    if (!this.checkAdmin(request, response)) return
    const data = await directoryMigrationValidator.validate(request.all())
    const result = await checkDirectoryMigrationPaths(data)
    return response.json({ code: 200, message: '', data: result })
  }

  async createDirectoryMigrationTarget({ request, response }: HttpContext) {
    if (!this.checkAdmin(request, response)) return
    const { targetPath } = await createMigrationTargetValidator.validate(request.all())
    const result = await createMigrationTarget(targetPath)
    if (!result.available) {
      return response.status(422).json({ code: 422, message: result.message, data: result })
    }
    return response.json({ code: 200, message: '', data: result })
  }

  async createDirectoryMigration({ request, response }: HttpContext) {
    if (!this.checkAdmin(request, response)) return
    const data = await directoryMigrationValidator.validate(request.all())
    const check = await checkDirectoryMigrationPaths(data)
    if (!check.available || !check.source.resolvedPath || !check.target.resolvedPath) {
      return response.status(422).json({ code: 422, message: check.message, data: check })
    }

    const fingerprint = createHash('sha256')
      .update(`${check.source.resolvedPath}\0${check.target.resolvedPath}\0${data.mirrorDelete === true}`)
      .digest('hex')
      .slice(0, 16)
    const job = await addTask({
      taskName: `directory_migration_${fingerprint}`,
      command: 'taskDirectoryMigration',
      args: {
        sourcePath: check.source.resolvedPath,
        targetPath: check.target.resolvedPath,
        mirrorDelete: data.mirrorDelete === true,
        deleteSource: data.deleteSource === true,
      },
      priority: TaskPriority.directoryMigration,
    })
    if (!job) {
      return response.status(409).json({ code: 409, message: '已有相同或目录冲突的迁移任务在队列中' })
    }
    return response.status(202).json({
      code: 200,
      message: '漫画迁移任务已加入队列',
      data: { jobId: job.id, check },
    })
  }
}
