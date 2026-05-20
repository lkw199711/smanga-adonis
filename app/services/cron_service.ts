import { createRequire } from 'module'
const require = createRequire(import.meta.url)
// @ts-ignore
const cron = require('node-cron')
import { get_config } from '#utils/index'
import prisma from '#start/prisma'
import { addTask } from './queue_service.js'
import { TaskPriority } from '#type/index'
import _ from 'lodash'
import log from '#services/log_service'

let scanCron: any = { stop: () => {} }
let syncCron: any = { stop: () => {} }
let createMediaPosterCron: any = { stop: () => {} }
let clearCompressCron: any = { stop: () => {} }
let trackerCleanupCron: any = { stop: () => {} }
let logCleanupCron: any = { stop: () => {} }
void scanCron
void syncCron
void createMediaPosterCron
void clearCompressCron
void trackerCleanupCron
void logCleanupCron

function create_scan_cron() {
  const config = get_config()
  const scanInterval = config.scan.interval

  try {
    scanCron = cron.schedule(scanInterval, async () => {
      const paths = await prisma.path.findMany()
      const autoScanPaths = paths.filter((item: any) => item.autoScan == 1 && item.deleteFlag == 0)
      for (let i = 0; i < autoScanPaths.length; i++) {
        const path = autoScanPaths[i]
        await addTask({
          taskName: `scan_path_${path.pathId}`,
          command: 'taskScanPath',
          args: { pathId: path.pathId },
          priority: TaskPriority.scan,
        })
      }
    })
  } catch (error) {
    void log.error({
      type: 'cron',
      module: 'cron',
      action: 'cron.scan.deploy_failed',
      message: 'deploy scan cron failed',
      error,
    })
  }
}

function create_sync_cron() {
  const config = get_config()
  const scanInterval = config.sync?.interval

  if (!scanInterval || scanInterval.trim() === '') {
    void log.info({
      type: 'cron',
      module: 'cron',
      action: 'cron.sync.skipped_unconfigured',
      message: 'sync cron not configured, skip',
    })
    return
  }

  try {
    syncCron = cron.schedule(scanInterval, async () => {
      const syncs = await prisma.sync.findMany()
      const autoSyncList = syncs.filter((sync: any) => sync.auto == 1)

      for (const sync of autoSyncList) {
        if (sync.syncType === 'media') {
          await addTask({
            taskName: `sync_media_${sync.syncId}`,
            command: 'taskSyncMedia',
            args: { receivedPath: sync.receivedPath, link: sync.link, origin: sync.origin },
            priority: TaskPriority.syncMedia,
          })
          continue
        }

        await addTask({
          taskName: `sync_manga_${sync.syncId}`,
          command: 'taskSyncManga',
          args: { receivedPath: sync.receivedPath, link: sync.link, origin: sync.origin },
          priority: TaskPriority.syncManga,
        })
      }
    })
  } catch (error) {
    void log.error({
      type: 'cron',
      module: 'cron',
      action: 'cron.sync.deploy_failed',
      message: 'deploy sync cron failed',
      error,
    })
  }
}

function create_media_poster_cron() {
  const config = get_config()
  const mediaPosterInterval = config.scan.mediaPosterInterval

  try {
    createMediaPosterCron = cron.schedule(mediaPosterInterval, async () => {
      const paths = await prisma.path.findMany()
      const autoScanPaths = paths.filter((item: any) => item.autoScan == 1 && item.deleteFlag == 0)
      const uniqueMediaPaths = _.uniqBy(autoScanPaths, 'mediaId')
      for (let i = 0; i < uniqueMediaPaths.length; i++) {
        const item = uniqueMediaPaths[i]
        await addTask({
          taskName: `create_media_poster_${item.mediaId}`,
          command: 'createMediaPoster',
          args: { mediaId: item.mediaId },
          priority: TaskPriority.createMediaPoster,
        })
      }
    })
  } catch (error) {
    void log.error({
      type: 'cron',
      module: 'cron',
      action: 'cron.media_poster.deploy_failed',
      message: 'deploy media poster cron failed',
      error,
    })
  }
}

function create_clear_compress_cron() {
  const config = get_config()
  const clearCron = config.compress.clearCron

  try {
    clearCompressCron = cron.schedule(clearCron, async () => {
      await addTask({
        taskName: 'clear_compress_cache',
        command: 'clearCompressCache',
        args: {},
        priority: TaskPriority.clearCompress,
      })
    })
  } catch (error) {
    void log.error({
      type: 'cron',
      module: 'cron',
      action: 'cron.compress_cleanup.deploy_failed',
      message: 'deploy compress cleanup cron failed',
      error,
    })
  }
}

function create_tracker_cleanup_cron() {
  const config = get_config()
  const p2p = config?.p2p
  if (!p2p?.enable || !p2p?.role?.tracker) {
    return
  }

  const cleanupCron = p2p?.tracker?.cleanupCron
  if (!cleanupCron || String(cleanupCron).trim() === '') {
    void log.info({
      type: 'cron',
      module: 'tracker',
      action: 'tracker.cleanup.skipped_unconfigured',
      message: 'tracker cleanup cron not configured, skip',
    })
    return
  }

  try {
    trackerCleanupCron = cron.schedule(cleanupCron, async () => {
      try {
        const mod = await import('./tracker/tracker_node_service.js')
        const trackerNodeService = mod.default
        const count = await trackerNodeService.markOfflineNodes()
        if (count > 0) {
          await log.info({
            type: 'tracker',
            module: 'tracker',
            action: 'tracker.cleanup.marked_offline_nodes',
            message: `[tracker] marked ${count} offline nodes`,
            context: { count },
          })
        }
      } catch (error) {
        await log.error({
          type: 'cron',
          module: 'tracker',
          action: 'tracker.cleanup.failed',
          message: 'tracker offline cleanup failed',
          error,
        })
      }
    })
  } catch (error) {
    void log.error({
      type: 'cron',
      module: 'tracker',
      action: 'tracker.cleanup.deploy_failed',
      message: 'deploy tracker cleanup cron failed',
      error,
    })
  }
}

function create_log_cleanup_cron() {
  const config = get_config()
  const logging = config?.logging || {}
  const dbConfig = logging?.db || {}

  if (logging.enabled === false || dbConfig.enabled === false) {
    return
  }

  const retainDays = Number(dbConfig.retainDays || 30)
  const schedule = String(dbConfig.cleanupCron || '0 30 3 * * *')

  try {
    logCleanupCron = cron.schedule(schedule, async () => {
      const beforeDate = new Date(Date.now() - retainDays * 24 * 60 * 60 * 1000)
      try {
        const result = await prisma.log.deleteMany({
          where: {
            createTime: {
              lt: beforeDate,
            },
          },
        })

        await log.info({
          type: 'system',
          module: 'system',
          action: 'log.cleanup.completed',
          message: `log cleanup completed, deleted ${result.count} rows`,
          awaitPersist: true,
          context: {
            retainDays,
            beforeDate: beforeDate.toISOString(),
            deletedCount: result.count,
            schedule,
          },
        })
      } catch (error) {
        await log.error({
          type: 'system',
          module: 'system',
          action: 'log.cleanup.failed',
          message: 'log cleanup failed',
          error,
          awaitPersist: true,
          context: {
            retainDays,
            beforeDate: beforeDate.toISOString(),
            schedule,
          },
        })
      }
    })
  } catch (error) {
    void log.error({
      type: 'cron',
      module: 'cron',
      action: 'cron.log_cleanup.deploy_failed',
      message: 'deploy log cleanup cron failed',
      error,
    })
  }
}

export {
  create_scan_cron,
  create_sync_cron,
  create_media_poster_cron,
  create_clear_compress_cron,
  create_tracker_cleanup_cron,
  create_log_cleanup_cron,
}
