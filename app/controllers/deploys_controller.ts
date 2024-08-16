import type { HttpContext } from '@adonisjs/core/http'
import { get_config, delay } from '#utils/index'
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
  public async database_get({ response }: HttpContext) {
    const config = get_config()

    return response.json(new SResponse({ code: 0, message: '', data: config.sql }))
  }

  public async database_test({ response }: HttpContext) {
    return response.json(new SResponse({ code: 0, message: '连接成功', data: true }))
  }

  public async database_check({ response }: HttpContext) {
    const config = get_config()
    const { client } = config.sql

    // 停止守护进程定时器
    stopTimer()
    prisma?.$disconnect()
    delay(2000)
    if (client === 'sqlite') {
      const schemaPath = path.join(rootDir, 'prisma', 'sqlite', 'schema.prisma')
      runNpxCommand('npx prisma generate --schema=' + schemaPath)
      runNpxCommand('npx prisma migrate deploy --schema=' + schemaPath)
    } else if (client === 'mysql') {
      runNpxCommand('npx prisma generate --schema=./prisma/mysql/schema.prisma')
      runNpxCommand('npx prisma migrate deploy --schema=./prisma/mysql/schema.prisma')
    } else if (client === 'postgresql' || client === 'pgsql') {
      const schemaPath = path.join(rootDir, 'prisma', 'pgsql', 'schema.prisma')
      runNpxCommand('npx prisma generate --schema=' + schemaPath)
      runNpxCommand('npx prisma migrate deploy --schema=' + schemaPath)
    } else {
      return response.json(new SResponse({ code: 1, message: '数据库类型不支持', data: false }))
    }

    // 重新启动守护进程定时器
    // startTimer()
    prisma?.$connect()
    // 数据库链接成功

    return response.json(new SResponse({ code: 0, message: '连接成功', data: true }))
  }
}
