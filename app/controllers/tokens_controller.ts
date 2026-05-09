import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import {
  idParamTokenValidator,
  createTokenValidator,
  updateTokenValidator,
} from '#validators/token'

export default class TokensController {
  public async index({ response }: HttpContext) {
    const list = await prisma.token.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    const { tokenId } = await idParamTokenValidator.validate(params)
    const token = await prisma.token.findUnique({ where: { tokenId } })
    const showResponse = new SResponse({ code: 0, message: '', data: token })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = await createTokenValidator.validate(request.all())
    const token = await prisma.token.create({
      data: insertData as any,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: token })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    const { tokenId } = await idParamTokenValidator.validate(params)
    const modifyData = await updateTokenValidator.validate(request.all())
    const token = await prisma.token.update({
      where: { tokenId },
      data: modifyData as any,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: token })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    const { tokenId } = await idParamTokenValidator.validate(params)
    const token = await prisma.token.delete({ where: { tokenId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: token })
    return response.json(destroyResponse)
  }
}
