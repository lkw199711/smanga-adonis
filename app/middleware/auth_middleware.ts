/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-06-20 19:42:14
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-06 20:44:21
 * @FilePath: \smanga-adonis\app\middleware\auth_middleware.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Auth middleware is used authenticate HTTP requests and deny
 * access to unauthenticated users.
 */
export default class AuthMiddleware {
  /**
   * The URL to redirect to, when authentication fails
   */
  redirectTo = '/login'

  async handle({ request }: HttpContext, next: NextFn) {
    const skipRoutes = ['/deploy', '/test']

    if (skipRoutes.some((route) => request.url().startsWith(route))) {
      // 如果是 deploy 或 test 控制器，跳过中间件
      await next()
      return
    }

    const userToken = request.header('Authorization')

    await ctx.auth.authenticateUsing(options.guards, { loginRoute: this.redirectTo })
    return next()
  }
}