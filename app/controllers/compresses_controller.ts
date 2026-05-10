import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { s_delete } from '#utils/index'
import { addTask } from '#services/queue_service'
import {
  listCompressValidator,
  idParamCompressValidator,
  createCompressValidator,
  updateCompressValidator,
  batchIdsParamCompressValidator,
} from '#validators/compress'

export default class CompressesController {
  // 校验是否为管理员
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const userId = request.userId
    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response.status(403).json({ code: 403, message: '没有权限访问', status: 'no permission' })
      return false
    }
    return true
  }

  public async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { page, pageSize } = await listCompressValidator.validate(request.qs())
    const queryParams = {
      ...(page && {
        skip: (page - 1) * (pageSize ?? 10),
        take: pageSize ?? 10,
      }),
    }
    const [list, count] = await Promise.all([
      prisma.compress.findMany(queryParams),
      prisma.compress.count(),
    ])

    return response.json({ code: 200, message: '', list, count })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const data = await createCompressValidator.validate(request.all())
    const compress = await prisma.compress.create({ data: data as any })
    return response.json({ code: 200, message: '新增成功', data: compress })
  }

  public async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { compressId } = await idParamCompressValidator.validate(params)
    const compress = await prisma.compress.findUnique({ where: { compressId } })
    if (!compress) {
      return response.status(404).json({ code: 404, message: '记录不存在' })
    }
    return response.json({ code: 200, message: '', data: compress })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { compressId } = await idParamCompressValidator.validate(params)
    const data = await updateCompressValidator.validate(request.all())
    const compress = await prisma.compress.update({
      where: { compressId },
      data: data as any,
    })
    return response.json({ code: 200, message: '更新成功', data: compress })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { compressId } = await idParamCompressValidator.validate(params)
    const compress = await prisma.compress.findUnique({ where: { compressId } })
    if (!compress) {
      return response.status(404).json({ code: 404, message: '记录不存在' })
    }

    // 先删文件再删记录
    try {
      await s_delete(compress.compressPath)
    } catch (_error) {
      // 文件可能已不存在，忽略
    }
    await prisma.compress.delete({ where: { compressId } })

    return response.json({ code: 200, message: '删除成功', data: compress })
  }

  // 批量删除
  public async destroy_batch({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { compressIds } = await batchIdsParamCompressValidator.validate(params)
    const compresses = await prisma.compress.findMany({
      where: { compressId: { in: compressIds } },
    })

    // 先删文件
    for (const compress of compresses) {
      try {
        await s_delete(compress.compressPath)
      } catch (_error) {
        // 文件可能已不存在，忽略
      }
    }

    // 再删数据库记录
    const deleteResponse = await prisma.compress.deleteMany({
      where: { compressId: { in: compressIds } },
    })

    return response.json({ code: 200, message: '删除成功', data: deleteResponse })
  }

  public async clear({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    await addTask({
      taskName: 'clear_compress_cache',
      command: 'clearCompressCache',
      args: {},
    })
    return response.json({ code: 200, message: '清除任务新增成功' })
  }
}
