/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-06-20 20:33:01
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-06 11:20:21
 * @FilePath: \smanga-adonis\app\controllers\users_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import md5 from '../utils/md5.js'

export default class UsersController {
  public async index({ response }: HttpContext) {
    const list = await prisma.user.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { userId } = params
    userId = Number(userId)
    const user = await prisma.user.findUnique({ where: { userId } })
    const showResponse = new SResponse({ code: 0, message: '', data: user })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const { userName, passWord } = request.only(['userName', 'passWord'])

    if (!userName) {
      return response.json(new SResponse({ code: 1, message: '用户名不能为空' }))
    }

    const user = await prisma.user.create({
      data: { userName, passWord: md5(passWord) },
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: user })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { userId } = params
    const { userName, passWord } = request.body()
    const user = await prisma.user.update({
      where: { userId },
      data: { userName, passWord: md5(passWord) },
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: user })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { userId } = params
    const user = await prisma.user.delete({ where: { userId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: user })
    return response.json(destroyResponse)
  }
}
