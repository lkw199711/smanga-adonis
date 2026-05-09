import type { HttpContext } from '@adonisjs/core/http'
import { get_config } from '#utils/index'
import { SResponse } from '#interfaces/response'
import { runNpxCommand } from '#utils/npxShell'
import { stopTimer } from '#services/timer_service'
import prisma from '#start/prisma'
import * as path from 'path'
const rootDir = process.cwd()
/**
 * 服务端部署初始化程序
 * 主要是为了支持多数据库
 * 以及做数据库的初始化
 */
export default class DeploysController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || user.role !== 'admin') {
      response
        .status(403)
        .json(new SResponse({ code: 403, message: '无权限', status: 'no permission' }))
      return false
    }
    return true
  }

  public async database_get({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const config = get_config()
    return response.json(new SResponse({ code: 0, message: '', data: config.sql }))
  }

  public async database_test({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    return response.json(new SResponse({ code: 0, message: '连接成功', data: true }))
  }

  public async database_check({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const config = get_config()
    const { client } = config.sql

    // 停止守护进程定时器
    stopTimer()
    await prisma?.$disconnect()
    if (client === 'sqlite') {
      const schemaPath = path.join(rootDir, 'prisma', 'sqlite', 'schema.prisma')
      await runNpxCommand('npx prisma generate --schema=' + schemaPath)
      await runNpxCommand('npx prisma migrate deploy --schema=' + schemaPath)
    } else if (client === 'mysql') {
      await runNpxCommand('npx prisma generate --schema=./prisma/mysql/schema.prisma')
      await runNpxCommand('npx prisma migrate deploy --schema=./prisma/mysql/schema.prisma')
    } else if (client === 'postgresql' || client === 'pgsql') {
      const schemaPath = path.join(rootDir, 'prisma', 'pgsql', 'schema.prisma')
      await runNpxCommand('npx prisma generate --schema=' + schemaPath)
      await runNpxCommand('npx prisma migrate deploy --schema=' + schemaPath)
    } else {
      return response.json(new SResponse({ code: 1, message: '数据库类型不支持', data: false }))
    }

    await prisma?.$connect()

    return response.json(new SResponse({ code: 0, message: '连接成功', data: true }))
  }
}
