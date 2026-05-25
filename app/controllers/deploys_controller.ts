import type { HttpContext } from '@adonisjs/core/http'
import { get_config, set_config, get_os } from '#utils/index'
import { runNpxCommand } from '#utils/npxShell'
import { stopTimer } from '#services/timer_service'
import prisma from '#start/prisma'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
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
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  public async database_get({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const config = get_config()
    return response.json({ code: 200, message: '', data: config.sql })
  }

  public async database_test({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    return response.json({ code: 200, message: '连接成功', data: true })
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
      return response.status(400).json({ code: 400, message: '数据库类型不支持', data: false })
    }

    await prisma?.$connect()

    return response.json({ code: 200, message: '连接成功', data: true })
  }

  /**
   * 查询部署状态（无鉴权）
   * GET /api/deploy/status
   * 返回 { deploy, sql }，前端据此跳转 init 页并预填数据库配置
   */
  public async status({ response }: HttpContext) {
    const config = get_config()
    return response.json({
      code: 200,
      message: '',
      data: {
        deploy: !!config.sql?.deploy,
        sql: config.sql || null,
      },
    })
  }

  /**
   * 测试数据库连接（无鉴权，仅在 deploy=false 时可用）
   * POST /api/deploy/test-connection
   * body: { client, host, port, username, password, database }
   * 使用原生驱动（非 Prisma）测试连通性
   */
  public async testConnection({ request, response }: HttpContext) {
    const config = get_config()

    // 已部署则拒绝
    if (config.sql?.deploy) {
      return response.status(400).json({
        code: 400,
        message: '系统已完成初始化，此接口不可用',
      })
    }

    const body = request.body() as any
    const { client, host, port, username, password, database } = body

    if (!client) {
      return response.status(400).json({ code: 400, message: '请指定数据库类型' })
    }

    try {
      if (client === 'sqlite') {
        // SQLite：验证数据目录可写
        const dbPath = path.join(rootDir, 'prisma', 'smanga.db')
        const dir = path.dirname(dbPath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        // 尝试打开文件 fd 验证可写
        const fd = fs.openSync(dbPath, 'a')
        fs.closeSync(fd)
      } else if (client === 'mysql') {
        const mysql2 = await import('mysql2/promise')
        const conn = await mysql2.createConnection({
          host: host || '127.0.0.1',
          port: port || 3306,
          user: username || 'root',
          password: password || '',
          database: database || undefined,
          connectTimeout: 10000,
        })
        await conn.ping()
        await conn.end()
      } else if (['pgsql', 'postgresql', 'postgres', 'postgressql'].includes(client)) {
        const { Client } = await import('pg')
        const conn = new Client({
          host: host || '127.0.0.1',
          port: port || 5432,
          user: username || 'postgres',
          password: password || '',
          database: database || 'postgres',
          connectionTimeoutMillis: 10000,
        })
        await conn.connect()
        await conn.end()
      } else {
        return response.status(400).json({ code: 400, message: `不支持的数据库类型: ${client}` })
      }

      return response.json({
        code: 200,
        message: '数据库连接成功',
      })
    } catch (e: any) {
      return response.status(400).json({
        code: 400,
        message: `连接失败: ${e.message || e}`,
      })
    }
  }

  /**
   * 第一步：数据库初始化（无鉴权，仅在 deploy=false 时可用）
   * POST /api/deploy/init
   * 写入配置 + 执行 prisma generate/migrate，不创建用户
   */
  public async init({ request, response }: HttpContext) {
    const config = get_config()

    if (config.sql?.deploy) {
      return response.status(400).json({
        code: 400,
        message: '系统已完成初始化，此接口不可用',
      })
    }

    const body = request.body() as any
    const { client, host, port, username, password, database } = body

    const pgClients = ['pgsql', 'postgresql', 'postgres', 'postgressql']

    // 1. 校验参数
    if (![...pgClients, 'sqlite', 'mysql'].includes(client)) {
      return response.status(400).json({ code: 400, message: '不支持的数据库类型' })
    }

    // 2. 写入 smanga.json
    config.sql = {
      client,
      host: host || '127.0.0.1',
      port: port || (pgClients.includes(client) ? 5432 : 3306),
      username: username || '',
      password: password || '',
      database: database || 'smanga',
      deploy: false,
    }
    set_config(config)

    // 3. 写入 .env
    const ENV_FILE = path.join(rootDir, '.env')
    let dbUrl: string, varName: string, schemaPath: string

    if (client === 'sqlite') {
      const os = get_os()
      dbUrl = (os === 'Windows' || os === 'MacOS')
        ? `file:${path.join(rootDir, 'data', 'db', 'smanga.db')}`
        : 'file:/data/db/smanga.db'
      varName = 'DB_URL_SQLITE'
      schemaPath = path.join(rootDir, 'prisma', 'sqlite', 'schema.prisma')
    } else if (client === 'mysql') {
      dbUrl = `mysql://${username}:${password}@${host}:${port}/${database}`
      varName = 'DB_URL_MYSQL'
      schemaPath = path.join(rootDir, 'prisma', 'mysql', 'schema.prisma')
    } else {
      dbUrl = `postgresql://${username}:${password}@${host}:${port}/${database}`
      varName = 'DB_URL_POSTGRESQL'
      schemaPath = path.join(rootDir, 'prisma', 'pgsql', 'schema.prisma')
    }

    let envContent = fs.readFileSync(ENV_FILE, 'utf8')
    const regex = new RegExp(`^${varName}=.*`, 'm')
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${varName}=${dbUrl}`)
    } else {
      envContent += `\n${varName}=${dbUrl}`
    }
    fs.writeFileSync(ENV_FILE, envContent, 'utf8')

    // 4. 执行 Prisma 命令
    const genResult = runNpxCommand('npx prisma generate --schema=' + schemaPath)
    if (!genResult.success) {
      return response.status(500).json({
        code: 500,
        message: 'Prisma generate 失败: ' + (genResult.error || '未知错误'),
      })
    }
    const migrateResult = runNpxCommand('npx prisma migrate deploy --schema=' + schemaPath)
    if (!migrateResult.success) {
      return response.status(500).json({
        code: 500,
        message: 'Prisma migrate 失败: ' + (migrateResult.error || '未知错误'),
      })
    }

    // 返回成功，不设 deploy=true，不退出
    return response.json({
      code: 200,
      message: '数据库初始化完成',
    })
  }

  /**
   * 第二步：创建管理员账户并完成部署（无鉴权，数据库已初始化后可用）
   * POST /api/deploy/init-account
   * 创建 admin 用户 → deploy=true → process.exit(0)
   */
  public async initAccount({ request, response }: HttpContext) {
    const config = get_config()

    if (config.sql?.deploy) {
      return response.status(400).json({
        code: 400,
        message: '系统已完成初始化，此接口不可用',
      })
    }

    // 防御：必须先完成数据库初始化
    if (!config.sql) {
      return response.status(400).json({
        code: 400,
        message: '请先完成数据库初始化',
      })
    }

    const body = request.body() as any
    const { adminUser, adminPass } = body

    if (!adminUser || !adminPass) {
      return response.status(400).json({ code: 400, message: '管理员用户名和密码不能为空' })
    }

    // 从 smanga.json 构造 DB URL
    const { client, host, port, username, password, database } = config.sql
    let dbUrl: string

    if (client === 'sqlite') {
      const os = get_os()
      dbUrl = (os === 'Windows' || os === 'MacOS')
        ? `file:${path.join(rootDir, 'data', 'db', 'smanga.db')}`
        : 'file:/data/db/smanga.db'
    } else if (client === 'mysql') {
      dbUrl = `mysql://${username}:${password}@${host}:${port}/${database}`
    } else {
      dbUrl = `postgresql://${username}:${password}@${host}:${port}/${database}`
    }

    // 创建 admin 用户
    try {
      const { PrismaClient } = await import('@prisma/client')
      const initPrisma = new PrismaClient({
        datasources: { db: { url: dbUrl } },
      })

      const md5 = (str: string) =>
        crypto.createHash('md5').update(str).digest('hex')

      await initPrisma.user.create({
        data: {
          userName: adminUser,
          passWord: md5(adminPass),
          role: 'admin',
          mediaPermit: 'all',
        },
      })
      await initPrisma.$disconnect()
    } catch (e: any) {
      return response.status(500).json({
        code: 500,
        message: '创建管理员用户失败: ' + (e?.message || String(e)),
      })
    }

    // 标记完成
    config.sql.deploy = true
    set_config(config)

    response.json({
      code: 200,
      message: '初始化完成，服务即将重启',
      data: true,
    })

    // 延迟退出，确保响应已发送
    setTimeout(() => process.exit(0), 1000)
  }
}
