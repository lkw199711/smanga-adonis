/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-06 23:59:41
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-07 00:16:17
 * @FilePath: \smanga-adonis\contracts\http.ts
 */
// contracts/http.ts
import { HttpContext } from '@adonisjs/core/http'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    request: RequestContractWithUserId
  }
}

interface RequestContractWithUserId extends HttpContext['request'] {
  userId?: string // 根据你的需求设置类型，可能是 string 或 number
}
