/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 15:33:32
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-03 15:58:58
 * @FilePath: \smanga-adonis\start\init.ts
 */
import { join } from 'path'
import { promises as fs } from 'fs'

// 默认配置
const defaultConfig = {
  sql: {
    client: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    username: 'smanga',
    password: 'smanga',
    database: 'smanga',
  },
  imagick: {
    memory: '1gb',
    map: '1gb',
    density: 300,
    quality: 100,
  },
  scan: {
    interval: 60,
  },
  debug: {
    dispatchSync: 0,
  },
  ssl: {
    pem: '',
    key: '',
  },
  compress: {
    auto: 0,
    saveDuration: 100,
    poster: 300,
    bookmark: 300,
  },
}

export default async function boot() {
  // 获取当前运行路径作为根目录
  const rootDir = process.cwd()

  // 需要检查的文件夹
  const folders = ['compress', 'config', 'db', 'logs', 'poster', 'bookmark']

  // 检查并创建文件夹
  for (const folder of folders) {
    const folderPath = join(rootDir, folder)
    try {
      await fs.access(folderPath)
    } catch (error) {
      await fs.mkdir(folderPath, { recursive: true })
      console.log(`Created folder: ${folderPath}`)
    }
  }

  // 检查并创建配置文件
  const configFile = join(rootDir, 'smanga.json')

  try {
    await fs.access(configFile)
  } catch (error) {
    await fs.writeFile(configFile, JSON.stringify(defaultConfig, null, 2))
    console.log(`Created config file: ${configFile}`)
  }
}
