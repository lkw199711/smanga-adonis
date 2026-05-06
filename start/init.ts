import { join } from 'path'
import * as fs from 'fs'
import prisma from './prisma.js'
import { path_compress, path_poster, path_bookmark, s_delete, path_cache, get_os, get_config, set_config, read_json } from '#utils/index'
import { create_scan_cron, create_sync_cron, create_media_poster_cron, create_clear_compress_cron, create_tracker_cleanup_cron } from '#services/cron_service'
import { v4 as uuidv4 } from 'uuid'

// 默认配置
const defaultConfig = {
  "sql": {
    "client": "sqlite",
    "host": "127.0.0.1",
    "port": 3306,
    "username": "smanga",
    "password": "smanga",
    "database": "smanga",
    "file": "./data/smanga.db",
    "deploy": true
  },
  "redis": {
    "host": "127.0.0.1",
    "port": 6379
  },
  "imagick": {
    "memory": "1gb",
    "map": "1gb",
    "density": 300,
    "quality": 100
  },
  "scan": {
    "auto": 0,
    "concurrency": 1,
    "reloadCover": 0,
    "doNotCopyCover": 1,
    "ignoreHiddenFiles": 1,
    "defaultTagColor": "#a0d911",
    "interval": "0 0 0,12 * * *",
    "mediaPosterInterval": "0 0 1 * * *",
    "createMediaPoster": 1
  },
  "debug": {
    "dispatchSync": 0
  },
  "ssl": {
    "pem": "",
    "key": ""
  },
  "compress": {
    "sync": 1,
    "auto": 0,
    "saveDuration": 100,
    "poster": 300,
    "bookmark": 300,
    "autoClear": 2,
    "limit": 1000,
    "clearCron": "0 0 0 1 * *"
  },
  "queue": {
    "concurrency": 1,
    "attempts": 3,
    "timeout": 120000
  },
  "sync": {
    "interval": "0 0 23,10 * * *"
  },
  "p2p": {
    "enable": false,
    "role": {
      "node": true,
      "tracker": false
    },
    "node": {
      "nodeId": "",
      "nodeToken": "",
      "nodeName": "",
      "listenPort": 3333,
      "publicHost": "",
      "publicPort": 0,
      "trackers": ["http://145000.xyz:9798"],
      "heartbeatInterval": 30,
      "announceInterval": 300,
      "allowLan": true,
      "lanHost": "",
      "lanPort": 3333,
      "maxConcurrentPulls": 2,
      "maxConcurrentServes": 4,
      "maxUploadKbps": 0,
      "maxDownloadKbps": 0,
      "defaultReceivedPath": "",
      "autoPullOnNewShare": false
    },
    "tracker": {
      "publicUrl": "",
      "listenPort": 0,
      "allowPublicRegister": true,
      "requireInviteToRegister": false,
      "maxNodes": 1000,
      "maxGroupsPerNode": 10,
      "maxMembersPerGroup": 50,
      "offlineThresholdSec": 90,
      "cleanupCron": "0 */10 * * * *",
      "adminNodeIds": []
    }
  }
}

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
  create_tracker_cleanup_cron()

  // 启动 P2P 心跳服务(若启用)
  try {
    const cfg = (await import('#utils/index')).get_config()
    if (cfg?.p2p?.enable && cfg?.p2p?.role?.node) {
      const { default: heartbeat } = await import('#services/p2p/p2p_heartbeat_service')
      await heartbeat.start()
    }
  } catch (e) {
    console.error('[p2p] 心跳服务启动异常', e)
  }
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

  if (config?.redis === undefined) {
    console.log('配置文件不存在redis字段，使用默认值')
    config.redis = defaultConfig.redis
    set_config(config)
  }

  if (config?.serverKey === undefined) {
    console.log('配置文件不存在serverKey字段，使用默认值')
    config.serverKey = uuidv4()
    set_config(config)
  }

  // 默认tracker地址常量，便于之后修改
  const DEFAULT_TRACKER_URL = 'http://145000.xyz:9798'

  // 老用户升级时补充 p2p 段,默认全部关闭
  if (config?.p2p === undefined) {
    console.log('配置文件不存在p2p字段，使用默认值')
    config.p2p = defaultConfig.p2p
    set_config(config)
  } else {
    // 递归补齐缺失的子字段
    let changed = false
    if (config.p2p.role === undefined) { config.p2p.role = defaultConfig.p2p.role; changed = true }
    if (config.p2p.node === undefined) { config.p2p.node = defaultConfig.p2p.node; changed = true }
    if (config.p2p.tracker === undefined) { config.p2p.tracker = defaultConfig.p2p.tracker; changed = true }
    
    // 如果本机不是tracker服务器，且trackers配置为空，则添加默认tracker地址
    if (config.p2p.enable && config.p2p.role?.node && !config.p2p.role?.tracker) {
      const trackers: string[] = config.p2p.node?.trackers || []
      if (trackers.length === 0) {
        console.log('检测到本机不是tracker服务器且trackers配置为空，自动添加默认tracker地址:', DEFAULT_TRACKER_URL)
        config.p2p.node.trackers = [DEFAULT_TRACKER_URL]
        changed = true
      }
    }
    
    if (changed) {
      console.log('配置文件 p2p 子字段不完整，补齐默认值')
      set_config(config)
    }
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
