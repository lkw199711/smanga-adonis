import { join } from 'path'
import * as fs from 'fs'
import prisma from './prisma.js'
import { path_compress, path_poster, path_bookmark, s_delete, path_cache, get_os, get_config, set_config, read_json } from '#utils/index'
import { create_scan_cron, create_sync_cron, create_media_poster_cron, create_clear_compress_cron } from '#services/cron_service'

// 默认配置
const defaultConfig  = read_json('./data-example/config/smanga.json')

export default async function boot() {
  const os = get_os()

  if (os === 'Windows') {
    await create_dir_win()
  } else {
    await create_dir_linux()
  }

  await check_config_ver()

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
  create_sync_cron()
  create_media_poster_cron()
  create_clear_compress_cron()
}

async function check_config_ver() {
  const config = get_config()
  const mediaPosterInterval = config.scan?.mediaPosterInterval
  const syncInterval = config.sync?.interval
  const ignoreHiddenFiles = config.scan?.ignoreHiddenFiles
  const defaultTagColor = config.scan?.defaultTagColor
  const compressSync = config.compress?.sync

  // 如果配置文件没有ignoreHiddenFiles字段，则添加，默认值为1
  if (ignoreHiddenFiles === undefined) {
    console.log('配置文件不存在ignoreHiddenFiles字段，使用默认值')
    config.scan.ignoreHiddenFiles = 1
    set_config(config)
  }

  if (!mediaPosterInterval) {
    console.log('配置文件不存在mediaPosterInterval字段，使用默认值')
    config.scan.mediaPosterInterval = defaultConfig.scan.mediaPosterInterval
    set_config(config)
  }

  if (!syncInterval) {
    console.log('配置文件不存在sync.interval字段，使用默认值')
    config.sync = { interval: defaultConfig.sync.interval }
    set_config(config)
  }

  if (!defaultTagColor) {
    console.log('配置文件不存在defaultTagColor字段，使用默认值')
    config.scan.defaultTagColor = '#a0d911'
    set_config(config)
  }

  // 如果配置文件不存在concurrency字段，则添加，默认值为1
  if (config.scan?.concurrency === undefined) {
    console.log('配置文件不存在concurrency字段，使用默认值')
    config.scan.concurrency = defaultConfig.scan.concurrency
    set_config(config)
  }

  // 如果配置文件不存在compress.sync字段，则添加，默认值为0
  if (compressSync === undefined) {
    console.log('配置文件不存在compress.sync字段，使用默认值')
    config.compress.sync = defaultConfig.compress.sync
    set_config(config)
  }

  if (config.scan?.createMediaPoster === undefined) {
    console.log('配置文件不存在createMediaPoster字段，使用默认值')
    config.scan.createMediaPoster = defaultConfig.scan.createMediaPoster
    set_config(config)
  }

  // 如果配置文件不存在compress.limit字段，则添加，默认值为1000
  if (config.compress?.limit === undefined) {
    console.log('配置文件不存在compress.limit字段，使用默认值')
    config.compress.limit = defaultConfig.compress.limit
    set_config(config)
  }

  if (config.compress?.clearCron === undefined) {
    console.log('配置文件不存在clearCron字段，使用默认值')
    config.compress.clearCron = defaultConfig.compress.clearCron
    set_config(config)
  }

  if (config.compress?.autoClear === undefined) {
    console.log('配置文件不存在autoClear字段，使用默认值')
    config.compress.autoClear = defaultConfig.compress.autoClear
    set_config(config)
  }
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
