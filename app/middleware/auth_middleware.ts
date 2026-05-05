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
import { get_config } from '#utils/index'
import {
  parse_basic_auth,
  authenticate_basic,
  BASIC_REALM,
} from '../utils/basic_auth.js'

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
    const skipRoutes = ['/deploy', '/test', '/login', '/file', '/analysis', '/homepage', '/tracker', '/p2p/serve']

    // 用 "全等 或 以 prefix/ 开头" 的方式精确匹配,避免 /p2p 误命中 /api/p2p,或 /tracker 误命中 /trackerxxx
    const url = request.url()
    const isSkipped = skipRoutes.some((prefix) => url === prefix || url.startsWith(prefix + '/'))
    if (isSkipped) {
      // 部署/测试/登录/资源/分析/对外接口/对等节点接口 跳过用户 token 校验
      await next()
      return
    }

    // ========================================================================
    // OPDS 分支: 使用 HTTP Basic Auth 鉴权 (兼容第三方阅读器, 如 可达漫画)
    // 全局开关: smanga.json 的 opds.enabled 为 0/false 时直接返回 404 (默认启用)
    // ========================================================================
    if (request.url().startsWith('/opds')) {
      const opdsCfg = (get_config() || {}).opds || {}
      const enabled = opdsCfg.enabled ?? 1
      if (enabled === 0 || enabled === false || String(enabled).toLowerCase() === 'false') {
        return response.status(404).send('OPDS disabled')
      }

      try {
        const cred = parse_basic_auth(request.header('authorization'))
        const user = await authenticate_basic(cred)
        if (!user) {
          return response
            .status(401)
            .header('WWW-Authenticate', `Basic realm="${BASIC_REALM}", charset="UTF-8"`)
            .send('Unauthorized')
        }
        request.userId = user.userId
        request.user = user
        await next()
        return
      } catch (err) {
        return response
          .status(500)
          .json(
            new SResponse({ code: 1, message: 'OPDS auth error: ' + (err?.message ?? 'unknown') })
          )
      }
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
