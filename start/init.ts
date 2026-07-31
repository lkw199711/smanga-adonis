import { join } from 'node:path'
import * as fs from 'node:fs'
import {
  path_compress,
  path_poster,
  path_bookmark,
  s_delete,
  path_cache,
  get_os,
  get_config,
  set_config,
} from '#utils/index'
import {
  create_scan_cron,
  create_sync_cron,
  create_media_poster_cron,
  create_clear_compress_cron,
  create_tracker_cleanup_cron,
} from '#services/cron_service'
import { startEmbeddedQueueWorkers } from '#services/queue/sql_queue_worker_service'
import { v4 as uuidv4 } from 'uuid'
import prisma from '#start/prisma'
import { migrateLegacyScanHistory } from '#services/migration/legacy_scan_backup_service'

// 默认配置
const defaultConfig = {
  sql: {
    client: 'sqlite',
    host: '127.0.0.1',
    port: 3306,
    username: 'smanga',
    password: 'smanga',
    database: 'smanga',
    file: './data/smanga.db',
    deploy: false,
  },
  imagick: {
    memory: '1gb',
    map: '1gb',
    density: 300,
    quality: 100,
  },
  scan: {
    engine: 'template-v2',
    auto: 0,
    reloadCover: 0,
    doNotCopyCover: 1,
    ignoreHiddenFiles: 1,
    defaultTagColor: '#a0d911',
    interval: '0 0 0,12 * * *',
    mediaPosterInterval: '0 0 1 * * *',
    createMediaPoster: 1,
  },
  debug: {
    dispatchSync: 0,
  },
  ssl: {
    pem: '',
    key: '',
  },
  compress: {
    sync: 1,
    auto: 0,
    saveDuration: 100,
    poster: 300,
    bookmark: 300,
    autoClear: 2,
    limit: 1000,
    clearCron: '0 0 0 1 * *',
  },
  queue: {
    driver: 'sql',
    concurrency: 1,
    attempts: 3,
    timeout: 120000,
    pollIntervalMs: 1000,
    retry: {
      baseDelayMs: 10000,
      maxDelayMs: 120000,
      jitter: true,
    },
    worker: {
      mode: 'external',
      stalledAfterMs: 60000,
      heartbeatIntervalMs: 10000,
      gracefulShutdownMs: 30000,
    },
    workers: {
      background: {
        enabled: true,
        queues: ['scan', 'sync', 'default'],
        concurrency: 1,
      },
      p2p: {
        enabled: false,
        queues: ['p2p'],
        concurrency: 3,
      },
      compress: {
        enabled: true,
        queues: ['compress'],
        concurrency: 1,
      },
    },
  },
  sync: {
    interval: '0 0 23,10 * * *',
  },
  p2p: {
    enable: false,
    role: {
      node: true,
      tracker: false,
    },
    node: {
      nodeId: '',
      nodeToken: '',
      nodeName: '',
      publicUrl: '',
      trackers: [
        'http://117.72.27.9:9797/api',
        // 备用 tracker 域名数组，初始化时自动补入缺失项
      ],
      heartbeatInterval: 30,
      announceInterval: 300,
      allowLan: true,
      lanHost: '',
      lanPort: 9797,
      maxConcurrentPulls: 2,
      maxConcurrentServes: 4,
      maxUploadKbps: 0,
      maxDownloadKbps: 0,
      defaultReceivedPath: '',
      autoPullOnNewShare: false,
    },
    tracker: {
      publicUrl: '',
      peers: [],
      allowPublicRegister: true,
      requireInviteToRegister: false,
      maxNodes: 1000,
      maxGroupsPerNode: 10,
      maxMembersPerGroup: 50,
      offlineThresholdSec: 90,
      cleanupCron: '0 */10 * * * *',
      adminNodeIds: [],
      syncKey: '',
      syncIntervalSec: 300,
    },
    pull: {
      timeoutMs: {
        root: 6 * 60 * 60 * 1000,
        media: 6 * 60 * 60 * 1000,
        manga: 3 * 60 * 60 * 1000,
        chapter: 30 * 60 * 1000,
        meta: 10 * 60 * 1000,
      },
    },
  },
}

/**
 * 仅做目录创建与配置版本检查，不触碰 Prisma
 * 用于首次部署初始化模式（sql.deploy=false）
 */
export async function init_dirs_only() {
  const os = get_os()

  if (['Windows', 'MacOS'].includes(os)) {
    await create_dir_win()
  } else {
    await create_dir_linux()
  }

  await check_config_ver()
}

export default async function boot() {
  const os = get_os()

  if (['Windows', 'MacOS'].includes(os)) {
    await create_dir_win()
  } else {
    await create_dir_linux()
  }

  await check_config_ver()

  // 迁移脚本只重命名旧扫描表；启动后先落盘备份，再幂等导入新的扫描记录表。
  await migrateLegacyScanHistory(prisma)

  // 删除缓存文件
  const cachePath = path_cache()
  fs.readdirSync(cachePath).forEach((file: any) => {
    const filePath = join(cachePath, file)
    s_delete(filePath)
  })

  // 设置路径自动扫描cron任务
  create_scan_cron()
  create_sync_cron()
  create_media_poster_cron()
  create_clear_compress_cron()
  create_tracker_cleanup_cron()
  await startEmbeddedQueueWorkers()

  // 启动 P2P 心跳服务(若启用)
  try {
    const utils = await import('#utils/index')
    const cfg = utils.get_config()
    if (cfg?.p2p?.enable && cfg?.p2p?.role?.node) {
      const { default: heartbeat } = await import('#services/p2p/p2p_heartbeat_service')
      await heartbeat.start()
    }
    // 启动 Tracker 间同步服务(若本机是 tracker)
    if (cfg?.p2p?.enable && cfg?.p2p?.role?.tracker && cfg?.p2p?.tracker?.syncKey) {
      const { default: trackerSyncService } = await import('#services/tracker/tracker_sync_service')
      trackerSyncService.start()
    }
  } catch (e) {
    console.error('[p2p] 心跳/同步服务启动异常', e)
  }
}

async function check_config_ver() {
  const config = get_config()
  const mediaPosterInterval = config.scan?.mediaPosterInterval
  const syncInterval = config.sync?.interval
  const ignoreHiddenFiles = config.scan?.ignoreHiddenFiles
  const defaultTagColor = config.scan?.defaultTagColor
  const compressSync = config.compress?.sync

  if (!['legacy', 'template-v1', 'template-v2'].includes(config.scan?.engine)) {
    console.log('扫描引擎配置不存在或无效，使用 template-v2')
    config.scan.engine = defaultConfig.scan.engine
    set_config(config)
  }

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

  if (config?.serverKey === undefined) {
    console.log('配置文件不存在serverKey字段，使用默认值')
    config.serverKey = uuidv4()
    set_config(config)
  }

  ensure_queue_config(config)

  // 默认tracker地址列表，便于之后增删
  // 初始化时会将用户配置中缺失的默认地址自动补入
  const DEFAULT_TRACKER_URLS: string[] = [
    'http://146000.xyz:9797/api',
    'http://149000.xyz:9797/api',
    'http://117.72.27.9:9797/api',
  ]

  // 老用户升级时补充 p2p 段,默认全部关闭
  if (config?.p2p === undefined) {
    console.log('配置文件不存在p2p字段，使用默认值')
    config.p2p = defaultConfig.p2p
    set_config(config)
  } else {
    // 递归补齐缺失的子字段
    let changed = false
    if (config.p2p.role === undefined) {
      config.p2p.role = defaultConfig.p2p.role
      changed = true
    }
    if (config.p2p.node === undefined) {
      config.p2p.node = defaultConfig.p2p.node
      changed = true
    }
    if (config.p2p.tracker === undefined) {
      config.p2p.tracker = defaultConfig.p2p.tracker
      changed = true
    }
    if (config.p2p.pull === undefined) {
      config.p2p.pull = defaultConfig.p2p.pull
      changed = true
    }
    if (config.p2p.tracker.peers === undefined) {
      config.p2p.tracker.peers = defaultConfig.p2p.tracker.peers
      changed = true
    }
    if (config.p2p.pull.timeoutMs === undefined) {
      config.p2p.pull.timeoutMs = defaultConfig.p2p.pull.timeoutMs
      changed = true
    }

    // 如果本机不是tracker服务器，将配置中缺失的默认tracker地址自动补入
    if ('listenPort' in config.p2p.node) {
      delete config.p2p.node.listenPort
      changed = true
    }
    if ('listenPort' in config.p2p.tracker) {
      delete config.p2p.tracker.listenPort
      changed = true
    }

    if (
      config.p2p.enable &&
      config.p2p.role?.node &&
      !config.p2p.role?.tracker &&
      config.sql.deploy === false
    ) {
      if (!Array.isArray(config.p2p.node.trackers)) {
        config.p2p.node.trackers = []
      }
      const trackers: string[] = config.p2p.node.trackers
      const added: string[] = []
      for (const url of DEFAULT_TRACKER_URLS) {
        console.log(
          `[p2p] 检测到本机不是tracker服务器，自动补入缺失的默认tracker地址: ${!trackers.includes(url) && config.sql.deploy === false}`
        )
        if (!trackers.includes(url)) {
          trackers.push(url)
          added.push(url)
        }
      }
      if (added.length > 0) {
        console.log('检测到本机不是tracker服务器，自动补入缺失的默认tracker地址:', added.join(', '))
        config.p2p.node.trackers = trackers
        changed = true
      }
    }

    if (changed) {
      console.log('配置文件 p2p 子字段不完整，补齐默认值')
      set_config(config)
    }
  }
}

function ensure_queue_config(config: any) {
  let changed = false
  const legacyConcurrency = Number(config.queue?.concurrency) || defaultConfig.queue.concurrency

  if (config.queue === undefined) {
    config.queue = defaultConfig.queue
    changed = true
  }

  if (config.queue.driver === undefined) {
    config.queue.driver = 'sql'
    changed = true
  }
  if (config.queue.attempts === undefined) {
    config.queue.attempts = defaultConfig.queue.attempts
    changed = true
  }
  if (config.queue.timeout === undefined) {
    config.queue.timeout = defaultConfig.queue.timeout
    changed = true
  }
  if (config.queue.pollIntervalMs === undefined) {
    config.queue.pollIntervalMs = defaultConfig.queue.pollIntervalMs
    changed = true
  }
  if (config.queue.retry === undefined) {
    config.queue.retry = defaultConfig.queue.retry
    changed = true
  }
  if (config.queue.retry.baseDelayMs === undefined) {
    config.queue.retry.baseDelayMs = defaultConfig.queue.retry.baseDelayMs
    changed = true
  }
  if (config.queue.retry.maxDelayMs === undefined) {
    config.queue.retry.maxDelayMs = defaultConfig.queue.retry.maxDelayMs
    changed = true
  }
  if (config.queue.retry.jitter === undefined) {
    config.queue.retry.jitter = defaultConfig.queue.retry.jitter
    changed = true
  }
  if (config.queue.worker === undefined) {
    config.queue.worker = defaultConfig.queue.worker
    changed = true
  }
  if (config.queue.worker.mode === undefined) {
    config.queue.worker.mode = defaultConfig.queue.worker.mode
    changed = true
  }
  if (config.queue.worker.stalledAfterMs === undefined) {
    config.queue.worker.stalledAfterMs = defaultConfig.queue.worker.stalledAfterMs
    changed = true
  }
  if (config.queue.worker.heartbeatIntervalMs === undefined) {
    config.queue.worker.heartbeatIntervalMs = defaultConfig.queue.worker.heartbeatIntervalMs
    changed = true
  }
  if (config.queue.worker.gracefulShutdownMs === undefined) {
    config.queue.worker.gracefulShutdownMs = defaultConfig.queue.worker.gracefulShutdownMs
    changed = true
  }
  if (config.queue.workers === undefined) {
    config.queue.workers = defaultConfig.queue.workers
    changed = true
  }
  if (config.queue.workers.background === undefined) {
    config.queue.workers.background = {
      ...defaultConfig.queue.workers.background,
      concurrency: legacyConcurrency,
    }
    changed = true
  }
  if (config.queue.workers.p2p === undefined) {
    config.queue.workers.p2p = {
      ...defaultConfig.queue.workers.p2p,
      concurrency: legacyConcurrency * 3,
    }
    changed = true
  }
  if (config.queue.workers.compress === undefined) {
    config.queue.workers.compress = {
      ...defaultConfig.queue.workers.compress,
      concurrency: legacyConcurrency,
    }
    changed = true
  }
  if (config.queue.workers.background.concurrency === undefined) {
    config.queue.workers.background.concurrency = legacyConcurrency
    changed = true
  }
  if (config.queue.workers.p2p.concurrency === undefined) {
    config.queue.workers.p2p.concurrency = legacyConcurrency * 3
    changed = true
  }
  if (config.queue.workers.compress.concurrency === undefined) {
    config.queue.workers.compress.concurrency = legacyConcurrency
    changed = true
  }
  if (config.queue.workers.background.enabled === undefined) {
    config.queue.workers.background.enabled = defaultConfig.queue.workers.background.enabled
    changed = true
  }
  if (config.queue.workers.p2p.enabled === undefined) {
    config.queue.workers.p2p.enabled = defaultConfig.queue.workers.p2p.enabled
    changed = true
  }
  if (config.queue.workers.compress.enabled === undefined) {
    config.queue.workers.compress.enabled = defaultConfig.queue.workers.compress.enabled
    changed = true
  }
  if (config.queue.workers.background.queues === undefined) {
    config.queue.workers.background.queues = defaultConfig.queue.workers.background.queues
    changed = true
  }
  if (config.queue.workers.p2p.queues === undefined) {
    config.queue.workers.p2p.queues = defaultConfig.queue.workers.p2p.queues
    changed = true
  }
  if (config.queue.workers.compress.queues === undefined) {
    config.queue.workers.compress.queues = defaultConfig.queue.workers.compress.queues
    changed = true
  }

  // 设计约定:不启用独立 p2p 进程,p2p 任务由 background worker 统一消费。
  // 存量/老配置可能 background.queues 缺少 'p2p'(历史上按分离式建模),在此自愈补齐,
  // 否则 p2p 队列无任何消费者,拉取任务会永远卡在 pending(文件不下载)。
  if (
    Array.isArray(config.queue.workers.background.queues) &&
    !config.queue.workers.background.queues.includes('p2p')
  ) {
    const queues = config.queue.workers.background.queues
    const defaultIdx = queues.indexOf('default')
    if (defaultIdx >= 0) queues.splice(defaultIdx, 0, 'p2p')
    else queues.push('p2p')
    changed = true
  }

  if (changed) {
    console.log('配置文件 queue 字段不完整，补齐 SQL 队列默认值')
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
