import { join } from 'path'
import * as fs from 'fs'
import prisma from './prisma.js'
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
  create_log_cleanup_cron,
} from '#services/cron_service'
import { v4 as uuidv4 } from 'uuid'
import log from '#services/log_service'

const defaultConfig = {
  sql: {
    client: 'sqlite',
    host: '127.0.0.1',
    port: 3306,
    username: 'smanga',
    password: 'smanga',
    database: 'smanga',
    file: './data/smanga.db',
    deploy: true,
  },
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
  imagick: {
    memory: '1gb',
    map: '1gb',
    density: 300,
    quality: 100,
  },
  scan: {
    auto: 0,
    concurrency: 1,
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
    concurrency: 1,
    attempts: 3,
    timeout: 120000,
  },
  logging: {
    enabled: true,
    db: {
      enabled: true,
      minLevel: 'info',
      retainDays: 30,
      maxContextBytes: 16000,
      maxExceptionBytes: 32000,
    },
    http: {
      enabled: true,
      logSuccess: false,
      slowMs: 1000,
      sampleRate: 1,
    },
    security: {
      enabled: true,
    },
    queue: {
      enabled: true,
      logCompleted: true,
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
      listenPort: 9798,
      publicUrl: '',
      trackers: ['http://145000.xyz:9798'],
      heartbeatInterval: 30,
      announceInterval: 300,
      allowLan: true,
      lanHost: '',
      lanPort: 9798,
      maxConcurrentPulls: 2,
      maxConcurrentServes: 4,
      maxUploadKbps: 0,
      maxDownloadKbps: 0,
      defaultReceivedPath: '',
      autoPullOnNewShare: false,
    },
    tracker: {
      publicUrl: '',
      listenPort: 0,
      allowPublicRegister: true,
      requireInviteToRegister: false,
      maxNodes: 1000,
      maxGroupsPerNode: 10,
      maxMembersPerGroup: 50,
      offlineThresholdSec: 90,
      cleanupCron: '0 */10 * * * *',
      adminNodeIds: [],
    },
  },
}

export default async function boot() {
  const os = get_os()

  if (os === 'Windows') {
    await create_dir_win()
  } else {
    await create_dir_linux()
  }

  await check_config_ver()

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
    await log.info({
      type: 'system',
      module: 'init',
      action: 'system.default_admin.created.console',
      message: 'Created default admin user',
      context: {
        userName: 'smanga',
      },
    })
    await log.info({
      type: 'system',
      module: 'init',
      action: 'system.default_admin.created',
      message: 'default admin user created',
      awaitPersist: true,
      context: {
        userName: 'smanga',
      },
    })
  }

  const cachePath = path_cache()
  fs.readdirSync(cachePath).forEach((file: any) => {
    const filePath = join(cachePath, file)
    s_delete(filePath)
  })

  await prisma.task.updateMany({
    where: {
      status: 'in-progress',
    },
    data: {
      status: 'pending',
    },
  })

  create_scan_cron()
  create_sync_cron()
  create_media_poster_cron()
  create_clear_compress_cron()
  create_tracker_cleanup_cron()
  create_log_cleanup_cron()

  try {
    const cfg = (await import('#utils/index')).get_config()
    if (cfg?.p2p?.enable && cfg?.p2p?.role?.node) {
      const { default: heartbeat } = await import('#services/p2p/p2p_heartbeat_service')
      await heartbeat.start()
    }
  } catch (e) {
    await log.error({
      type: 'cron',
      module: 'p2p',
      action: 'p2p.heartbeat.start.failed',
      message: 'p2p heartbeat service start failed',
      error: e,
      awaitPersist: true,
    })
  }
}

async function check_config_ver() {
  const config = get_config()

  if (config.scan?.ignoreHiddenFiles === undefined) {
    config.scan.ignoreHiddenFiles = defaultConfig.scan.ignoreHiddenFiles
    set_config(config)
  }

  if (!config.scan?.mediaPosterInterval) {
    config.scan.mediaPosterInterval = defaultConfig.scan.mediaPosterInterval
    set_config(config)
  }

  if (!config.sync?.interval) {
    config.sync = { interval: defaultConfig.sync.interval }
    set_config(config)
  }

  if (!config.scan?.defaultTagColor) {
    config.scan.defaultTagColor = defaultConfig.scan.defaultTagColor
    set_config(config)
  }

  if (config.scan?.concurrency === undefined) {
    config.scan.concurrency = defaultConfig.scan.concurrency
    set_config(config)
  }

  if (config.compress?.sync === undefined) {
    config.compress.sync = defaultConfig.compress.sync
    set_config(config)
  }

  if (config.scan?.createMediaPoster === undefined) {
    config.scan.createMediaPoster = defaultConfig.scan.createMediaPoster
    set_config(config)
  }

  if (config.compress?.limit === undefined) {
    config.compress.limit = defaultConfig.compress.limit
    set_config(config)
  }

  if (config.compress?.clearCron === undefined) {
    config.compress.clearCron = defaultConfig.compress.clearCron
    set_config(config)
  }

  if (config.compress?.autoClear === undefined) {
    config.compress.autoClear = defaultConfig.compress.autoClear
    set_config(config)
  }

  if (config.redis === undefined) {
    config.redis = defaultConfig.redis
    set_config(config)
  }

  if (config.serverKey === undefined) {
    config.serverKey = uuidv4()
    set_config(config)
  }

  if (config.logging === undefined) {
    config.logging = defaultConfig.logging
    set_config(config)
  } else {
    let loggingChanged = false
    if (config.logging.db === undefined) {
      config.logging.db = defaultConfig.logging.db
      loggingChanged = true
    }
    if (config.logging.http === undefined) {
      config.logging.http = defaultConfig.logging.http
      loggingChanged = true
    }
    if (config.logging.security === undefined) {
      config.logging.security = defaultConfig.logging.security
      loggingChanged = true
    }
    if (config.logging.queue === undefined) {
      config.logging.queue = defaultConfig.logging.queue
      loggingChanged = true
    }
    if (loggingChanged) {
      set_config(config)
    }
  }

  const DEFAULT_TRACKER_URL = 'http://145000.xyz:9798'

  if (config.p2p === undefined) {
    config.p2p = defaultConfig.p2p
    set_config(config)
  } else {
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

    if (config.p2p.enable && config.p2p.role?.node && !config.p2p.role?.tracker) {
      const trackers: string[] = config.p2p.node?.trackers || []
      if (trackers.length === 0) {
        config.p2p.node.trackers = [DEFAULT_TRACKER_URL]
        changed = true
      }
    }

    if (changed) {
      set_config(config)
    }
  }
}

async function create_dir_win() {
  const rootDir = process.cwd()
  const folders = [
    path_compress(),
    './data/config',
    './data/db',
    './data/logs',
    path_poster(),
    path_bookmark(),
    path_cache(),
  ]

  for (const folder of folders) {
    try {
      await fs.promises.access(folder)
    } catch {
      await fs.promises.mkdir(folder, { recursive: true })
      await log.info({
        type: 'system',
        module: 'init',
        action: 'filesystem.folder.created',
        message: `Created folder: ${folder}`,
        context: { folder, os: 'windows' },
      })
    }
  }

  const configFile = join(rootDir, 'data', 'config', 'smanga.json')
  try {
    await fs.promises.access(configFile)
  } catch {
    await fs.promises.writeFile(configFile, JSON.stringify(defaultConfig, null, 2))
    await log.info({
      type: 'system',
      module: 'init',
      action: 'filesystem.config.created',
      message: `Created config file: ${configFile}`,
      context: { configFile, os: 'windows' },
    })
  }
}

async function create_dir_linux() {
  const folders = [
    path_compress(),
    '/data/config',
    '/data/db',
    '/data/logs',
    path_poster(),
    path_bookmark(),
    path_cache(),
  ]

  for (const folder of folders) {
    try {
      await fs.promises.access(folder)
    } catch {
      await fs.promises.mkdir(folder, { recursive: true })
      await log.info({
        type: 'system',
        module: 'init',
        action: 'filesystem.folder.created',
        message: `Created folder: ${folder}`,
        context: { folder, os: 'linux' },
      })
    }
  }

  const configFile = join('/', 'data', 'config', 'smanga.json')
  try {
    await fs.promises.access(configFile)
  } catch {
    await fs.promises.writeFile(configFile, JSON.stringify(defaultConfig, null, 2))
    await log.info({
      type: 'system',
      module: 'init',
      action: 'filesystem.config.created',
      message: `Created config file: ${configFile}`,
      context: { configFile, os: 'linux' },
    })
  }
}
