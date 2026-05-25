import { get_config, get_os } from '../app/utils/index.js'
import * as path from 'node:path'
// 获取当前运行路径作为根目录
const rootDir = process.cwd()

let prisma: any = null

try {
  const config = get_config()
  const { sql } = config

  // deploy=true 时才动态加载 PrismaClient（deploy=false 时 @prisma/client 尚未生成）
  if (sql?.deploy) {
    const clientModule: any = await import('@prisma/client')
    const PrismaClient = clientModule.PrismaClient || clientModule.default?.PrismaClient || clientModule.default

    const { client, username, password, host, port, database } = sql

    let databaseUrl = ''
    if (client === 'mysql') {
      databaseUrl = `mysql://${username}:${password}@${host}:${port}/${database}`
    } else if (client === 'sqlite') {
      const os = get_os()
      if (os === 'Windows' || os === 'MacOS') {
        databaseUrl = `file:${path.join(rootDir, 'data', 'db', 'smanga.db')}`
      } else {
        databaseUrl = `file:${path.join('/', 'data', 'db', 'smanga.db')}`
      }
    } else if (client === 'postgresql' || client === 'pgsql') {
      databaseUrl = `postgresql://${username}:${password}@${host}:${port}/${database}`
    }

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    })
  }
} catch (error: any) {
  console.error('PrismaClient 初始化失败:', error.message)
}

export default prisma
