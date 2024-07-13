/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-06-20 20:33:01
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-06-20 20:33:19
 * @FilePath: \smanga-adonis\app\controllers\users_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'

export default class UsersController {
  async index(ctx: HttpContext) {
    return [
      {
        id: 1,
        username: 'virk',
      },
      {
        id: 2,
        username: 'romain',
      },
    ]
  }
}