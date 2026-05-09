import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
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
  public async index({ request, response }: HttpContext) {
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

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })
    return response.json(listResponse)
  }

  public async create({ request, response }: HttpContext) {
    const data = await createCompressValidator.validate(request.all())
    const compress = await prisma.compress.create({ data: data as any })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: compress })
    return response.json(saveResponse)
  }

  public async show({ params, response }: HttpContext) {
    const { compressId } = await idParamCompressValidator.validate(params)
    const compress = await prisma.compress.findUnique({ where: { compressId } })
    const showResponse = new SResponse({ code: 0, message: '', data: compress })
    return response.json(showResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { compressId } = await idParamCompressValidator.validate(params)
    const data = await updateCompressValidator.validate(request.all())
    const compress = await prisma.compress.update({
      where: { compressId },
      data: data as any,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: compress })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    const { compressId } = await idParamCompressValidator.validate(params)
    const compress = await prisma.compress.delete({ where: { compressId } })
    const compressPath = compress.compressPath
    // 删除文件
    await s_delete(compressPath)
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: compress })
    return response.json(destroyResponse)
  }

  // 批量删除
  public async destroy_batch({ params, response }: HttpContext) {
    const { compressIds } = await batchIdsParamCompressValidator.validate(params)
    const compresses = await prisma.compress.findMany({
      where: { compressId: { in: compressIds } },
    })

    // 删除数据库记录
    const deleteResponse = await prisma.compress.deleteMany({
      where: { compressId: { in: compressIds } },
    })

    // 删除文件
    for (const compress of compresses) {
      await s_delete(compress.compressPath)
    }

    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: deleteResponse })
    return response.json(destroyResponse)
  }

  public async clear({ response }: HttpContext) {
    await addTask({
      taskName: 'clear_compress_cache',
      command: 'clearCompressCache',
      args: {},
    })
    const clearResponse = new SResponse({ code: 0, message: '清除任务新增成功' })
    return response.json(clearResponse)
  }
}
