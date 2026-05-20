import ScanPathJob from './scan_job.js'
import ScanMangaJob from './scan_manga_job.js'
import DeleteChapterJob from './delete_chapter_job.js'
import DeleteMangaJob from './delete_manga_job.js'
import DeletePathJob from './delete_path_job.js'
import DeleteMediaJob from './delete_media_job.js'
import CopyPosterJob from './copy_poster_job.js'
import CreateMediaPosterJob from './create_media_poster_job.js'
import ReloadMangaMetaJob from './reload_manga_meta_job.js'
import SyncMediaJob from './sync_media_job.js'
import SyncMangaJob from './sync_manga_job.js'
import SyncChapterJob from './sync_chapter_job.js'
import CompressChapterJob from './compress_chapter_job.js'
import ClearCompressJob from './clear_compress_job.js'
import P2PPullJob from './p2p/p2p_pull_job.js'
import PullMediaJob from './p2p/pull/pull_media_sub_job.js'
import PullMangaJob from './p2p/pull/pull_manga_sub_job.js'
import PullChapterJob from './p2p/pull/pull_chapter_sub_job.js'
import PullMetaJob from './p2p/pull/pull_meta_sub_job.js'
import { get_config } from '#utils/index'
import log from '#services/log_service'

import Bull from 'bull'
type queueConfigType = {
  concurrency: number
  attempts: number
  timeout: number
}

const queueConfig: queueConfigType = get_config()?.queue || {
  concurrency: 1,
  attempts: 3,
  timeout: 120000,
}

const concurrency = queueConfig?.concurrency ?? 1
const attempts = queueConfig?.attempts ?? 3
const timeout = queueConfig?.timeout ?? 120000
void concurrency
void attempts
void timeout

const serverKey: string = (get_config()?.serverKey || 'default').toString().trim() || 'default'
const queueName = `smanga:${serverKey}`

const redisOptions = {
  host: get_config()?.redis?.host || '127.0.0.1',
  port: get_config()?.redis?.port || 6379,
}


const scanQueue = new Bull(queueName, {
  redis: redisOptions,
})

void log.info({
  type: 'queue',
  module: 'queue',
  action: 'queue.initialized',
  message: 'queue initialized',
  queue: queueName,
  context: {
    queueName,
    redisHost: redisOptions.host,
    redisPort: redisOptions.port,
    concurrency,
    attempts,
    timeout,
  },
})

function detectModule(command: string, taskQueue?: string): string {
  if (/^taskP2P|p2p/i.test(command) || taskQueue === 'p2p') return 'p2p'
  if (/^taskSync|sync/i.test(command) || taskQueue === 'sync') return 'sync'
  if (/compress/i.test(command) || taskQueue === 'compress') return 'compress'
  if (/scan/i.test(command)) return 'scan'
  if (/delete/i.test(command)) return 'task'
  return 'queue'
}

type JobLike = {
  id?: string | number
  attemptsMade?: number
  data?: {
    taskName?: string
    command?: string
    args?: any
  }
}

async function runJobWithLog(job: JobLike, queue: string, handler: () => Promise<void>) {
  const command = job?.data?.command || 'unknown'
  const startAt = Date.now()
  const moduleName = detectModule(command, queue)

  await log.info({
    type: 'queue',
    module: moduleName,
    action: 'job.started',
    message: `${command} started`,
    queue,
    context: {
      queueName,
      taskQueue: queue,
      jobId: job?.id,
      taskName: job?.data?.taskName,
      command,
      args: job?.data?.args,
      attemptsMade: job?.attemptsMade,
      maxAttempts: queueConfig.attempts,
      timeout: queueConfig.timeout,
    },
  })

  try {
    await handler()

    await log.info({
      type: 'queue',
      module: moduleName,
      action: 'job.completed',
      message: `${command} completed`,
      queue,
      context: {
        queueName,
        taskQueue: queue,
        jobId: job?.id,
        taskName: job?.data?.taskName,
        command,
        durationMs: Date.now() - startAt,
      },
    })
  } catch (error) {
    await log.error({
      type: 'queue',
      module: moduleName,
      action: 'job.failed',
      message: `${command} failed`,
      queue,
      error,
      awaitPersist: true,
      context: {
        queueName,
        taskQueue: queue,
        jobId: job?.id,
        taskName: job?.data?.taskName,
        command,
        args: job?.data?.args,
        attemptsMade: job?.attemptsMade,
        maxAttempts: queueConfig.attempts,
        timeout: queueConfig.timeout,
        durationMs: Date.now() - startAt,
      },
    })
    throw error
  }
}

scanQueue.on('failed', (job, err) => {
  const maxAttempts = Number(job?.opts?.attempts ?? queueConfig.attempts ?? 1)
  const attemptsMade = Number(job?.attemptsMade ?? 0)
  const retryable = attemptsMade < maxAttempts

  void log.error({
    type: 'queue',
    module: detectModule(job?.data?.command || 'queue', job?.queue?.name),
    action: 'job.failed.event',
    message: `${job?.data?.command || 'unknown'} failed`,
    queue: job?.queue?.name || null,
    error: err,
    awaitPersist: true,
    context: {
      queueName,
      taskQueue: job?.queue?.name,
      jobId: job?.id,
      taskName: job?.data?.taskName,
      command: job?.data?.command,
      args: job?.data?.args,
      attemptsMade,
      maxAttempts,
    },
  })

  if (retryable) {
    void log.warn({
      type: 'queue',
      module: detectModule(job?.data?.command || 'queue', job?.queue?.name),
      action: 'job.retrying',
      message: `${job?.data?.command || 'unknown'} retrying`,
      queue: job?.queue?.name || null,
      context: {
        queueName,
        taskQueue: job?.queue?.name,
        jobId: job?.id,
        taskName: job?.data?.taskName,
        command: job?.data?.command,
        attemptsMade,
        maxAttempts,
        nextAttempt: attemptsMade + 1,
      },
    })
  }
})

scanQueue.on('stalled', (job) => {
  void log.warn({
    type: 'queue',
    module: detectModule(job?.data?.command || 'queue', job?.queue?.name),
    action: 'job.stalled',
    message: `${job?.data?.command || 'unknown'} stalled`,
    queue: job?.queue?.name || null,
    context: {
      queueName,
      taskQueue: job?.queue?.name,
      jobId: job?.id,
      taskName: job?.data?.taskName,
      command: job?.data?.command,
      attemptsMade: job?.attemptsMade,
    },
  })
})

scanQueue.process('compress', queueConfig.concurrency, async (job: any) => {
  const { command, args } = job.data

  await runJobWithLog(job, 'compress', async () => {
    switch (command) {
      case 'compressChapter':
        await new CompressChapterJob(args).run()
        break
      case 'clearCompressCache':
        await new ClearCompressJob().run()
        break
      default:
        break
    }
  })

  return true
})

scanQueue.process('scan', queueConfig.concurrency, async (job: any) => {
  const { command, args } = job.data

  await runJobWithLog(job, 'scan', async () => {
    await task_process(command, args)
  })
})

scanQueue.process('sync', queueConfig.concurrency, async (job: any) => {
  const { command, args } = job.data

  await runJobWithLog(job, 'sync', async () => {
    await task_process(command, args)
  })
})

const p2pConcurrency =
  Number(get_config()?.p2p?.node?.maxConcurrentPulls) || queueConfig.concurrency || 2

scanQueue.process('p2p', p2pConcurrency, async (job: any) => {
  const { command, args } = job.data

  await runJobWithLog(job, 'p2p', async () => {
    await task_process(command, args)
  })
})

scanQueue.process(queueConfig.concurrency, async (job: any) => {
  const { command, args } = job.data

  await runJobWithLog(job, 'default', async () => {
    await task_process(command, args)
  })
})

const deleteQueue = new Bull(queueName, {
  redis: redisOptions,
})

const compressQueue = new Bull(queueName, {
  redis: redisOptions,
})

async function task_process(command: string, args: any) {
  switch (command) {
    case 'taskScanPath':
      await new ScanPathJob(args).run()
      break
    case 'taskScanManga':
      await new ScanMangaJob(args).run()
      break
    case 'deleteMedia':
      await new DeleteMediaJob(args).run()
      break
    case 'deletePath':
      await new DeletePathJob(args).run()
      break
    case 'deleteManga':
      await new DeleteMangaJob(args).run()
      break
    case 'deleteChapter':
      await new DeleteChapterJob(args).run()
      break
    case 'copyPoster':
      await new CopyPosterJob(args).run()
      break
    case 'compressChapter':
      await new CompressChapterJob(args).run()
      break
    case 'createMediaPoster':
      await new CreateMediaPosterJob(args).run()
      break
    case 'reloadMangaMeta':
      await new ReloadMangaMetaJob(args).run()
      break
    case 'clearCompressCache':
      await new ClearCompressJob().run()
      break
    case 'taskSyncMedia':
      await new SyncMediaJob(args).run()
      break
    case 'taskSyncManga':
      await new SyncMangaJob(args).run()
      break
    case 'taskSyncChapter':
      await new SyncChapterJob(args).run()
      break
    case 'taskP2PPull':
      await new P2PPullJob(args).run()
      break
    case 'taskP2PPullMedia':
      await new PullMediaJob(args).run()
      break
    case 'taskP2PPullManga':
      await new PullMangaJob(args).run()
      break
    case 'taskP2PPullChapter':
      await new PullChapterJob(args).run()
      break
    case 'taskP2PPullMeta':
      await new PullMetaJob(args).run()
      break
    default:
      break
  }
}

async function path_scanning(pathId: number) {
  const wattingJobs = await scanQueue.getWaiting()
  const activeJobs = await scanQueue.getActive()
  const jobs = wattingJobs.concat(activeJobs)
  const thisPathJobs = jobs.filter((job: any) => job.data.taskName === `scan_path_${pathId}`)
  if (thisPathJobs.length > 0) {
    return true
  }

  return false
}

async function path_deleting(pathId: number) {
  const wattingJobs = await scanQueue.getWaiting()
  const activeJobs = await scanQueue.getActive()
  const jobs = wattingJobs.concat(activeJobs)
  const thisPathJobs = jobs.filter((job: any) => job.data.taskName === `delete_path_${pathId}`)
  if (thisPathJobs.length > 0) {
    return true
  }

  return false
}

type addTaskType = {
  taskName: string
  command: string
  args: any
  priority?: number
  timeout?: number
}

async function addTask({ taskName, command, args, priority, timeout }: addTaskType) {

  const config = get_config()
  const dispatchSync = config.debug.dispatchSync == 1
  if (dispatchSync) {
    const fakeJob: JobLike = {
      id: `sync-${Date.now()}`,
      attemptsMade: 0,
      data: {
        taskName,
        command,
        args,
      },
    }

    await runJobWithLog(fakeJob, 'sync-direct', async () => {
      switch (command) {
        case 'taskScanPath':
          await new ScanPathJob(args).run()
          break
        case 'taskScanManga':
          await new ScanMangaJob(args).run()
          break
        case 'deleteMedia':
          await new DeleteMediaJob(args).run()
          break
        case 'deletePath':
          await new DeletePathJob(args).run()
          break
        case 'deleteManga':
          await new DeleteMangaJob(args).run()
          break
        case 'deleteChapter':
          await new DeleteChapterJob(args).run()
          break
        case 'copyPoster':
          await new CopyPosterJob(args).run()
          break
        case 'compressChapter':
          await new CompressChapterJob(args).run()
          break
        case 'createMediaPoster':
          await new CreateMediaPosterJob(args).run()
          break
        case 'reloadMangaMeta':
          await new ReloadMangaMetaJob(args).run()
          break
        case 'clearCompressCache':
          await new ClearCompressJob().run()
          break
        default:
          break
      }
    })

    return true
  }

  if (command === 'taskScanPath') {
    if (await path_scanning(args.pathId)) {
      await log.info({
        type: 'queue',
        module: 'scan',
        action: 'queue.task.skipped',
        message: `scan path skipped: path ${args.pathId} is running`,
        queue: 'scan',
        context: {
          taskName,
          command,
          args,
          reason: 'path_scanning',
        },
      })
      return false
    }
  } else if (command === 'deletePath') {
    if (await path_deleting(args.pathId)) {
      await log.info({
        type: 'queue',
        module: 'task',
        action: 'queue.task.skipped',
        message: `delete path skipped: path ${args.pathId} is deleting`,
        queue: 'scan',
        context: {
          taskName,
          command,
          args,
          reason: 'path_deleting',
        },
      })
      return false
    }
  }

  let taskQueue = 'scan'
  if (/sync/.test(taskName)) {
    taskQueue = 'sync'
  } else if (/compress/.test(taskName)) {
    taskQueue = 'compress'
  } else if (/p2p/i.test(taskName) || /^taskP2P/.test(command)) {
    taskQueue = 'p2p'
  }

  const job = await scanQueue.add(
    taskQueue,
    {
      taskName,
      command,
      args,
    },
    {
      priority,
      timeout: timeout ?? queueConfig.timeout,
      attempts: queueConfig.attempts,
      backoff: {
        type: 'exponential',
        delay: 10 * 1000,
        options: {
          factor: 2,
          jitter: true,
          maxDelay: 2 * 60 * 1000,
        },
      },
    }
  )

  await log.info({
    type: 'queue',
    module: detectModule(command, taskQueue),
    action: 'queue.task.enqueued',
    message: `${command} enqueued`,
    queue: taskQueue,
    context: {
      queueName,
      taskQueue,
      taskName,
      command,
      args,
      priority,
      timeout: timeout ?? queueConfig.timeout,
      attempts: queueConfig.attempts,
      jobId: job?.id,
    },
  })

  return job
}

export { scanQueue, deleteQueue, compressQueue, addTask, path_scanning, path_deleting }
