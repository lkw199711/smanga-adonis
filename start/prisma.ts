/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 09:12:16
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-09 10:26:12
 * @FilePath: \smanga-adonis\start\prisma.ts
 */
import { PrismaClient } from '@prisma/client'
import { get_config } from '../app/utils/index.js'

function createPrismaClient() {
  const config = get_config()
  const { sql } = config
  const { client, username, password, host, port, database } = sql

  let databaseUrl = ''
  if (client === 'mysql') {
    databaseUrl = `mysql://${username}:${password}@${host}:${port}/${database}`
  } else if (client === 'sqlite') {
    databaseUrl = `file:./sqlite.db`
  }

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  })
}

const prisma = createPrismaClient()

export default prisma
