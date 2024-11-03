/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-10-08 15:36:23
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-10-28 12:28:15
 * @FilePath: \smanga-adonis\app\services\database_check_service.ts
 */
import * as path from 'path'
import * as fs from 'fs'
import { runNpxCommand } from '#utils/npxShell'
import { get_os } from '#utils/index'
const os = get_os()
// 获取当前运行路径作为根目录
const rootDir = process.cwd()
let configFile = './data/config/smanga.json'
// 检查并创建配置文件
if (os === 'Linux') {
  configFile = '/data/config/smanga.json'
}

const rawData = fs.readFileSync(configFile, 'utf-8')
const config = JSON.parse(rawData)
const { client, deploy, host, port, username, password, database } = config.sql

export default async function hanle() {
  if (deploy) {
    return
  }
  // 拼接数据库连接字符串和变量名
  let dbUrl, varName, schemaPath;
  // 检查并创建数据库文件
  if (client === 'sqlite') {
    
    if (os === 'Windows') {
      dbUrl = 'file:./data/db.sqlite';
    } else {
      dbUrl = 'file:/data/db.sqlite';
    }

    varName = 'DB_URL_SQLITE';
    schemaPath = path.join(rootDir, 'prisma', 'sqlite', 'schema.prisma')
  } else if (client === 'mysql') {
    dbUrl = `mysql://${username}:${password}@${host}:${port}/${database}`;
    varName = 'DB_URL_MYSQL';
    schemaPath = path.join(rootDir, 'prisma', 'mysql', 'schema.prisma')
  } else if (client === 'postgresql' || client === 'pgsql') {
    dbUrl = `postgresql://${username}:${password}@${host}:${port}/${database}`;
    varName = 'DB_URL_POSTGRESQL';
    schemaPath = path.join(rootDir, 'prisma', 'pgsql', 'schema.prisma')
  } else {
    // 报错 数据库不支持
    console.error(`Unsupported database client: ${client}`);
    process.exit(1);
  }

  // env 文件路径
  const ENV_FILE = path.join(rootDir, '.env');

  // 更新 .env 文件中的对应变量
  let envContent = fs.readFileSync(ENV_FILE, 'utf8');
  const regex = new RegExp(`^${varName}=.*`, 'm');

  if (regex.test(envContent)) {
    // 如果存在，则替换
    envContent = envContent.replace(regex, `${varName}=${dbUrl}`);
  } else {
    // 如果不存在，则添加
    envContent += `\n${varName}=${dbUrl}`;
  }

  // 写回 .env 文件
  fs.writeFileSync(ENV_FILE, envContent, 'utf8');

  runNpxCommand('npx prisma generate --schema=' + schemaPath)
  runNpxCommand('npx prisma migrate deploy --schema=' + schemaPath)

  config.sql.deploy = true

  await fs.promises.writeFile(configFile, JSON.stringify(config, null, 2))
}
