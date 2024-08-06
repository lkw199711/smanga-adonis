/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-06-20 19:42:14
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-07 00:32:25
 * @FilePath: \smanga-adonis\app\middleware\auth_middleware.ts
 */
import prisma from '#start/prisma'
import type { NextFn } from '@adonisjs/core/types/http'
import { SResponse } from '../interfaces/response.js'
import type { HttpContextWithUserId } from '#type/http.js'

/**
 * Auth middleware is used authenticate HTTP requests and deny
 * access to unauthenticated users.
 */
export default class AuthMiddleware {
  /**
   * The URL to redirect to, when authentication fails
   */
  redirectTo = '/login'

  async handle({ request, response }: HttpContextWithUserId, next: NextFn) {
    const skipRoutes = ['/deploy', '/test', '/login']

    if (skipRoutes.some((route) => request.url().startsWith(route))) {
      // 如果是 deploy 或 test 控制器，跳过中间件
      await next()
      return
    }

    const userToken = request.header('token')

    if (!userToken) {
      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '用户信息失效', status: 'token error' }))
    }

    const token = await prisma.token.findFirst({ where: { token: userToken } })

    if (!token) {
      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '用户信息失效', status: 'token error' }))
    }

    request.userId = token.userId

    await next()
    return next()
  }
}
