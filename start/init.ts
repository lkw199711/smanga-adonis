/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 15:33:32
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-17 16:34:36
 * @FilePath: \smanga-adonis\start\init.ts
 */
import { join } from 'path'
import * as fs from 'fs'
import prisma from './prisma.js'
import { s_delete } from '#utils/index'

// import * as path from 'path'

// 默认配置
const defaultConfig = {
  sql: {
    client: 'sqlite',
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
  const folders = ['compress', 'config', 'db', 'logs', 'poster', 'bookmark', 'cache']

  // 检查并创建文件夹
  for (const folder of folders) {
    const folderPath = join(rootDir, folder)
    try {
      await fs.promises.access(folderPath)
    } catch (error) {
      await fs.promises.mkdir(folderPath, { recursive: true })
      console.log(`Created folder: ${folderPath}`)
    }
  }

  // 检查并创建配置文件
  const configFile = join(rootDir, 'smanga.json')

  try {
    await fs.promises.access(configFile)
  } catch (error) {
    await fs.promises.writeFile(configFile, JSON.stringify(defaultConfig, null, 2))
    console.log(`Created config file: ${configFile}`)
  }

  // 创建系统默认用户
  const users = await prisma.user.findMany()
  if (!users?.length) {
    await prisma.user.create({
      data: {
        userName: 'smanga',
        passWord: 'f7f1fe7186209906a97756ff912bb644',
        role: 'admin',
        mediaPermit: 'all',
      },
    })
    console.log('Created default admin user')
  }

  // 删除缓存文件
  const cachePath = join(rootDir, 'cache')
  fs.readdirSync(cachePath).forEach((file: any) => {
    const filePath = join(cachePath, file)
    s_delete(filePath)
  })

  /*
  // 清理已删除数据
  try {
    await prisma.path.deleteMany({ where: { deleteFlag: 1 } })
    await prisma.media.deleteMany({ where: { deleteFlag: 1 } })  
  } catch (e) {
    console.log(e)
  }
  
  */
}
