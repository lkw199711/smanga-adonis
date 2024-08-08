/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-06-20 20:33:01
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-08 18:32:15
 * @FilePath: \smanga-adonis\app\controllers\users_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import md5 from '../utils/md5.js'
import { HttpContextWithUserId } from '#type/http.js'

export default class UsersController {
  public async index({ request, response }: HttpContext) {
    const { page, pageSize } = request.only(['page', 'pageSize', 'order'])

    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      where: {},
    }

    const [list, count] = await Promise.all([
      prisma.user.findMany(queryParams),
      prisma.user.count({ where: queryParams.where }),
    ])

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
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
    const { userName, passWord, userConfig } = request.only(['userName', 'passWord', 'userConfig'])
    const user = await prisma.user.update({
      where: { userId },
      data: { userName, ...(passWord && { passWord: md5(passWord) }), userConfig },
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

  public async config({ request, response }: HttpContextWithUserId) { 
    // const { userConfig } = request.only(['userId', 'userConfig'])
    const userId = request.userId
    const user = await prisma.user.findFirst({ where: { userId } })

    if (!user) {
      return response.json(new SResponse({ code: 1, message: '获取用户信息错误' }))
    }
    return response.json(new SResponse({ code: 0, message: '', data: user?.userConfig || {} }))
  }
}
