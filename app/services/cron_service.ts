import { createRequire } from 'module'
const require = createRequire(import.meta.url)
// @ts-ignore
const cron = require('node-cron');
import { get_config } from '#utils/index'
import prisma from '#start/prisma'
import { addTask } from './queue_service.js';
import { TaskPriority } from '#type/index'
import _ from 'lodash'

let scanCron: any = { stop: () => { } }
let syncCron: any = { stop: () => { } }
let createMediaPosterCron: any = { stop: () => { } }
let clearCompressCron: any = { stop: () => { } }

function create_scan_cron() {
  // 停止旧扫描任务
  scanCron.stop()

  // 获取配置
  const config = get_config()
  const scanInterval = config.scan.interval

  // 定时扫描任务
  try {
    scanCron = cron.schedule(scanInterval, async () => {
      const paths = await prisma.path.findMany()
      const autoScanPaths = paths.filter((path: any) => path.autoScan == 1 && path.deleteFlag == 0)
      for (let i = 0; i < autoScanPaths.length; i++) {
        const path = autoScanPaths[i]
        // 任务名称唯一
        await addTask({
          taskName: `scan_path_${path.pathId}`,
          command: 'taskScanPath',
          args: { pathId: path.pathId },
          priority: TaskPriority.scan,
        })
      }
    });
  } catch (e) {
    console.error('部署corn扫描任务失败', e)
  }
}

function create_sync_cron() {
  // 停止旧扫描任务
  syncCron.stop()

  // 获取配置
  const config = get_config()
  const scanInterval = config.sync?.interval

  if (!scanInterval || scanInterval.trim() === '') {
    console.log('未配置同步任务定时策略，跳过部署')
    return;
  }

  // 定时扫描任务
  try {
    syncCron = cron.schedule(scanInterval, async () => {
      const syncs = await prisma.sync.findMany()
      const autoScanPaths = syncs.filter((sync: any) => sync.auto == 1)

      for (let sync of autoScanPaths) {

        if (sync.syncType === 'media') {
          // 创建媒体同步任务
          await addTask({
            taskName: `sync_media_${sync.syncId}`,
            command: 'taskSyncMedia',
            args: { receivedPath: sync.receivedPath, link: sync.link, origin: sync.origin },
            priority: TaskPriority.syncMedia,
          })
          continue
        } else {
          // 创建漫画同步任务
          await addTask({
            taskName: `sync_manga_${sync.syncId}`,
            command: 'taskSyncManga',
            args: { receivedPath: sync.receivedPath, link: sync.link, origin: sync.origin },
            priority: TaskPriority.syncManga,
          })
        }
      }
    });
  } catch (e) {
    console.error('部署corn扫描任务失败', e)
  }
}

function create_media_poster_cron() {
  // 停止旧扫描任务
  createMediaPosterCron.stop()

  // 获取配置
  const config = get_config()
  const mediaPosterInterval = config.scan.mediaPosterInterval

  // 定时扫描任务
  try {
    createMediaPosterCron = cron.schedule(mediaPosterInterval, async () => {
      const paths = await prisma.path.findMany()
      const autoScanPaths = paths.filter((path: any) => path.autoScan == 1 && path.deleteFlag == 0)
      const autoScanPathsUniqueMedia = _.uniqBy(autoScanPaths, 'mediaId')
      for (let i = 0; i < autoScanPathsUniqueMedia.length; i++) {
        const path = autoScanPathsUniqueMedia[i]
        addTask({
          taskName: `create_media_poster_${path.mediaId}`,
          command: 'createMediaPoster',
          args: { mediaId: path.mediaId },
          priority: TaskPriority.createMediaPoster,
        })
      }
    });
  } catch (e) {
    console.error('部署corn媒体库封面生成任务失败', e)
  }
}

function create_clear_compress_cron() {
  // 停止旧扫描任务
  clearCompressCron.stop()

  // 获取配置
  const config = get_config()
  const clearCron = config.compress.clearCron

  // 定时扫描任务
  try {
    clearCompressCron = cron.schedule(clearCron, async () => {
      await addTask({
        taskName: `clear_compress_cache`,
        command: 'clearCompressCache',
        args: {},
        priority: TaskPriority.clearCompress,
      })
    });
  } catch (e) {
    console.error('部署corn清除压缩缓存任务失败', e)
  }
}

export { create_scan_cron, create_sync_cron, create_media_poster_cron, create_clear_compress_cron }
