/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 09:12:16
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-10-26 16:53:11
 * @FilePath: \smanga-adonis\start\prisma.ts
 */
import { PrismaClient } from '@prisma/client'
import { get_config, get_os } from '../app/utils/index.js'
import * as path from 'node:path'
// 获取当前运行路径作为根目录
const rootDir = process.cwd()

function createPrismaClient() {
  const config = get_config()
  const { sql } = config
  const { client, username, password, host, port, database } = sql

  let databaseUrl = ''
  if (client === 'mysql') {
    databaseUrl = `mysql://${username}:${password}@${host}:${port}/${database}`
  } else if (client === 'sqlite') {
    const os = get_os()
    if (os === 'Windows') {
      databaseUrl = `file:${path.join(rootDir, 'data', 'db', 'smanga.db')}`
    } else {
      databaseUrl = `file:${path.join('/', 'data', 'db', 'smanga.db')}`
    }
  } else if (client === 'postgresql' || client === 'pgsql') {
    databaseUrl = `postgresql://${username}:${password}@${host}:${port}/${database}`
  }

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  })
}

// @ts-ignore
let prisma: PrismaClient = null
if (!prisma) {
  prisma = createPrismaClient() as PrismaClient
}

export default prisma
