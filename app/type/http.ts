/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-07 00:13:34
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-07 00:21:24
 * @FilePath: \smanga-adonis\type\http.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import type { Request } from '@adonisjs/core/http'

// 定义一个新的类型，继承 HttpContextContract
export interface HttpContextWithUserId extends HttpContext {
  request: Request & { userId: number }
}
