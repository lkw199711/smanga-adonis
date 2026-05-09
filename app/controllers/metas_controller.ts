import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import {
  idParamMetaValidator,
  createMetaValidator,
  updateMetaValidator,
} from '#validators/meta'

export default class MetasController {
  public async index({ response }: HttpContext) {
    const list = await prisma.meta.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    const { metaId } = await idParamMetaValidator.validate(params)
    const meta = await prisma.meta.findUnique({ where: { metaId } })
    const showResponse = new SResponse({ code: 0, message: '', data: meta })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = await createMetaValidator.validate(request.all())
    const meta = await prisma.meta.create({
      data: insertData as any,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: meta })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { metaId } = await idParamMetaValidator.validate(params)
    const modifyData = await updateMetaValidator.validate(request.all())
    const meta = await prisma.meta.update({
      where: { metaId },
      data: modifyData as any,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: meta })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    const { metaId } = await idParamMetaValidator.validate(params)
    const meta = await prisma.meta.delete({ where: { metaId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: meta })
    return response.json(destroyResponse)
  }
}
