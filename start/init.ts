/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 15:33:32
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-03-13 19:31:19
 * @FilePath: \smanga-adonis\start\init.ts
 */
import { join } from 'path'
import * as fs from 'fs'
import prisma from './prisma.js'
import { path_compress, path_poster, path_bookmark, s_delete, path_cache, get_os,get_config } from '#utils/index'
import { create_scan_cron } from '#services/cron_service'

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
  const os = get_os()

  if (os === 'Windows') {
    create_dir_win()
  } else {
    create_dir_linux()
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
  const cachePath = path_cache()
  fs.readdirSync(cachePath).forEach((file: any) => {
    const filePath = join(cachePath, file)
    s_delete(filePath)
  })

  // 将中断的任务重置
  await prisma.task.updateMany({
    where: {
      status: 'in-progress'
    },
    data: {
      status: 'pending'
    }
  })

  // 设置路径自动扫描cron任务
  create_scan_cron()
  
  /*
    // 清理已删除数据
    try {
      await prisma.path.deleteMany({ where: { deleteFlag: 1 } })
      await prisma.media.deleteMany({ where: { deleteFlag: 1 } })  
    } catch (e) {
      console.log(e)
    }
  */
 // 任务队列通过bull实现 弃用定时器
  // startTimer()
}

async function create_dir_win() {
  // 获取当前运行路径作为根目录
  const rootDir = process.cwd()

  // 需要检查的文件夹
  const folders = [
    path_compress(),
    './data/config',
    './data/db',
    './data/logs',
    path_poster(),
    path_bookmark(),
    path_cache(),
  ]

  // 检查并创建文件夹
  for (const folder of folders) {
    try {
      await fs.promises.access(folder)
    } catch (error) {
      await fs.promises.mkdir(folder, { recursive: true })
      console.log(`Created folder: ${folder}`)
    }
  }

  // 检查并创建配置文件
  const configFile = join(rootDir, 'data', 'config', 'smanga.json')

  try {
    await fs.promises.access(configFile)
  } catch (error) {
    await fs.promises.writeFile(configFile, JSON.stringify(defaultConfig, null, 2))
    console.log(`Created config file: ${configFile}`)
  }
}

async function create_dir_linux() {
  // 需要检查的文件夹
  const folders = [
    path_compress(),
    '/data/config',
    '/data/db',
    '/data/logs',
    path_poster(),
    path_bookmark(),
    path_cache(),
  ]

  // 检查并创建文件夹
  for (const folder of folders) {
    try {
      await fs.promises.access(folder)
    } catch (error) {
      await fs.promises.mkdir(folder, { recursive: true })
      console.log(`Created folder: ${folder}`)
    }
  }

  // 检查并创建配置文件
  const configFile = join('/', 'data', 'config', 'smanga.json')

  try {
    await fs.promises.access(configFile)
  } catch (error) {
    await fs.promises.writeFile(configFile, JSON.stringify(defaultConfig, null, 2))
    console.log(`Created config file: ${configFile}`)
  }
}