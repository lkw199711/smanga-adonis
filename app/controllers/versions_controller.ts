import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import {
  idParamVersionValidator,
  createVersionValidator,
  updateVersionValidator,
} from '#validators/version'

export default class VersionsController {
  public async index({ response }: HttpContext) {
    const list = await prisma.version.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    const { versionId } = await idParamVersionValidator.validate(params)
    const version = await prisma.version.findUnique({ where: { versionId } })
    const showResponse = new SResponse({ code: 0, message: '', data: version })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = await createVersionValidator.validate(request.all())
    const version = await prisma.version.create({
      data: insertData as any,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: version })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { versionId } = await idParamVersionValidator.validate(params)
    const modifyData = await updateVersionValidator.validate(request.all())
    const version = await prisma.version.update({
      where: { versionId },
      data: modifyData as any,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: version })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    const { versionId } = await idParamVersionValidator.validate(params)
    const version = await prisma.version.delete({ where: { versionId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: version })
    return response.json(destroyResponse)
  }
}
