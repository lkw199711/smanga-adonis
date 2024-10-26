import * as path from 'path'
import * as fs from 'fs'
import { runNpxCommand } from '#utils/npxShell'
import { path_config } from '#utils/index'
// 获取当前运行路径作为根目录
const rootDir = process.cwd()
// 检查并创建配置文件
const configFile = path_config()
const rawData = fs.readFileSync(configFile, 'utf-8')
const config = JSON.parse(rawData)
const { client, deploy } = config.sql

export default async function hanle() {
  if (deploy) {
    return
  }
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

  config.sql.deploy = true

  await fs.promises.writeFile(configFile, JSON.stringify(config, null, 2))
}
