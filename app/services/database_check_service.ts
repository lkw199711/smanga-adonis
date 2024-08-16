import * as path from 'path'
import { runNpxCommand } from '#utils/npxShell'
import { get_config } from '#utils/index'
const rootDir = process.cwd()
const config = get_config()
const { client } = config.sql

export default function hanle() {
  // 检查并创建数据库文件
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
    // 报错 数据库不支持
  }
}
