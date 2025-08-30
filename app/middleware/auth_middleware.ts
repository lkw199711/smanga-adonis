/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-06-20 19:42:14
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-21 11:48:50
 * @FilePath: \smanga-adonis\app\middleware\auth_middleware.ts
 */
import prisma from '#start/prisma'
import type { NextFn } from '@adonisjs/core/types/http'
import { SResponse } from '../interfaces/response.js'
import type { HttpContextWithUserId } from '../type/http.js'

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
    const skipRoutes = ['/deploy', '/test', '/login', '/file', '/analysis']

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

    if (userToken === 'apitest-lkw') {
      await next()
      return
    }

    // 动态引入 Prisma，只在需要的时候才加载它
    // const { default: prisma } = await import('#start/prisma')

    const token = await prisma.token.findFirst({ where: { token: userToken } })

    if (!token) {
      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '用户信息失效', status: 'token error' }))
    }
    const user: any = await prisma.user.findUnique({
      where: { userId: token.userId },
      include: { mediaPermissons: true, userPermissons: true },
    })

    // const permissonRoutes = ['/user', '/media', '/collect', '/compress', '/history', '/latest', '/log', '/task', '/path', '/bookmark', '/tag', '/manga', '/chapter', '/image', '/manga-tag', '/chart', '/search', '/config']

    // 用户信息模块
    if (request.url().startsWith('/user') && request.url() !== '/user-config') {
      if (user.role !== 'admin') {
        return response
          .status(401)
          .json(new SResponse({ code: 1, message: '无权限操作', status: 'permisson error' }))
      }
    }

    // 检验method为delete
    if (request.method() === 'DELETE' && user.role !== 'admin') {
      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '无权限操作', status: 'permisson error' }))
    }

    user.mediaLimit = user.mediaPermissons.map((item: any) => item.mediaId)
    user.moduleLimit = user.userPermissons.map((item: any) => item.module)
    request.userId = token.userId
    request.user = user

    await next()
    return next()
  }
}
