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
import { get_config } from '#utils/index'

import Bull from 'bull'
import cluster from 'cluster'
import * as os from 'os'
const numCPUs = os.cpus().length

// 主进程负责创建子进程, 子进程负责处理任务
if (cluster.isPrimary) {
  console.log(`主进程 ${process.pid} 正在运行`)

  // 根据 CPU 核心数创建工作进程
  // 这里我们使用较少的工作进程来避免资源过度消耗
  const workerCount = Math.max(1, Math.min(numCPUs, 4)) // 限制最大4个工作进程

  for (let i = 0; i < workerCount; i++) {
    const worker = cluster.fork()

    // 监听子进程消息
    worker.on('message', (message) => {
      console.log(`从工作进程 ${worker.process.pid} 收到消息:`, message)
    })
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`工作进程 ${worker.process.pid} 已退出，状态码: ${code}, 信号: ${signal}`)

    // 检查是否是正常退出
    if (code !== 0 && !signal) {
      console.log(`工作进程异常退出，正在重启...`)

      // 延迟重启以避免短时间内频繁重启
      setTimeout(() => {
        const newWorker = cluster.fork()
        console.log(`新工作进程 ${newWorker.process.pid} 已创建`)
      }, 1000)
    } else if (signal) {
      console.log(`工作进程被信号 ${signal} 终止`)
    }
  })

  // 主进程消息处理器
  process.on('message', (message) => {
    if (message.type === 'GET_TASK_STATUS') {
      // 处理任务状态查询请求
      const { taskId } = message
      getTaskStatus(taskId).then((status) => {
        if (process.send) {
          process.send({
            type: 'TASK_STATUS_RESPONSE',
            taskId,
            status,
          })
        }
      })
    }
  })

  cluster.on('online', (worker) => {
    console.log(`工作进程 ${worker.process.pid} 已上线`)
  })

  // 主进程不应该退出，应该保持运行以监控子进程
  // 移除exit(1)，让主进程继续运行

  // 如果需要在主进程中处理任务添加逻辑，可以在这里实现
  // 但通常任务添加逻辑应该由API层直接调用addTask函数
} else {
  console.log(`工作进程 ${process.pid} 已启动，负责处理队列任务`)

  // 工作进程可以向主进程发送消息
  if (process.send) {
    process.send({ type: 'WORKER_READY', workerId: process.pid })
  }
}

type queueConfigType = {
  concurrency: number // 并发数
  attempts: number // 最大重试次数
  timeout: number // 超时时间（毫秒）
}

const queueConfig: queueConfigType = get_config()?.queue || {
  concurrency: 1, // 默认并发数
  attempts: 3, // 默认重试次数
  timeout: 120000, // 默认超时时间为2分钟
}

const concurrency = queueConfig?.concurrency ?? 1 // 并发数
const attempts = queueConfig?.attempts ?? 3 // 最大重试次数
const timeout = queueConfig?.timeout ?? 120000 // 超时时间（毫秒）

const scanQueue = new Bull('smanga', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
})

scanQueue.on('completed', (job) => {})

scanQueue.on('failed', (job, err) => {
  console.error(`Job failed: ${job.id} with error: ${err.message}`)
})

// 只有工作进程才处理任务
if (!cluster.isPrimary) {
  // 处理压缩任务
  scanQueue.process('compress', queueConfig.concurrency, async (job: any) => {
    const { command, args } = job.data
    try {
      // 向主进程报告任务开始
      if (process.send) {
        process.send({
          type: 'TASK_STARTED',
          taskId: job.id,
          command: command,
          data: args,
        })
      }

      switch (command) {
        case 'compressChapter':
          //压缩章节
          console.log('压缩章节')
          await new CompressChapterJob(args).run()
          break
        default:
          break
      }

      // 向主进程报告任务完成
      if (process.send) {
        process.send({
          type: 'TASK_COMPLETED',
          taskId: job.id,
          result: { status: 'success', command, args },
        })
      }

      return true
    } catch (error) {
      console.error(`压缩任务失败: ${command}`, error)

      // 向主进程报告任务失败
      if (process.send) {
        process.send({
          type: 'TASK_FAILED',
          taskId: job.id,
          command: command,
          error: error.message || String(error),
        })
      }

      throw error
    }
  })

  // 处理扫描任务
  scanQueue.process('scan', queueConfig.concurrency, async (job: any) => {
    const { command, args } = job.data
    try {
      // 向主进程报告任务开始
      if (process.send) {
        process.send({
          type: 'TASK_STARTED',
          taskId: job.id,
          command: command,
          data: args,
        })
      }

      switch (command) {
        case 'taskScanPath':
          //扫描任务调用
          console.log('执行扫描任务')
          await new ScanPathJob(args).run()
          break
        case 'taskScanManga':
          console.log('执行扫描漫画任务')
          //扫描漫画任务调用
          await new ScanMangaJob(args).run()
          break
        case 'deleteMedia':
          //删除媒体库
          console.log('删除媒体库')
          await new DeleteMediaJob(args).run()
          break
        case 'deletePath':
          //删除路径
          console.log('删除路径')
          await new DeletePathJob(args).run()
          break
        case 'deleteManga':
          //删除漫画
          console.log('删除漫画')
          await new DeleteMangaJob(args).run()
          break
        case 'deleteChapter':
          //删除章节
          console.log('删除章节')
          await new DeleteChapterJob(args).run()
          break
        case 'copyPoster':
          await new CopyPosterJob(args).run()
          break
        case 'compressChapter':
          //压缩章节
          console.log('压缩章节')
          // await compress_chapter_job(args)
          break
        case 'createMediaPoster':
          //生成媒体库封面
          console.log('生成媒体库封面')
          await new CreateMediaPosterJob(args).run()
          break
        case 'reloadMangaMeta':
          //重新加载漫画元数据
          console.log('重新加载漫画元数据')
          await new ReloadMangaMetaJob(args).run()
          break
        default:
          break
      }

      // 向主进程报告任务完成
      if (process.send) {
        process.send({
          type: 'TASK_COMPLETED',
          taskId: job.id,
          result: { status: 'success', command, args },
        })
      }

      return true
    } catch (error) {
      console.error(`扫描任务失败: ${command}`, error)

      // 向主进程报告任务失败
      if (process.send) {
        process.send({
          type: 'TASK_FAILED',
          taskId: job.id,
          command: command,
          error: error.message || String(error),
        })
      }

      throw error
    }
  })

  scanQueue.process('sync', queueConfig.concurrency, async (job: any) => {
    const { command, args } = job.data
    try {
      // 向主进程报告任务开始
      if (process.send) {
        process.send({
          type: 'TASK_STARTED',
          taskId: job.id,
          command: command,
          data: args,
        })
      }

      switch (command) {
        case 'taskSyncMedia':
          //媒体库同步任务调用
          console.log('执行媒体库同步任务')
          await new SyncMediaJob(args).run()
          break
        case 'taskSyncManga':
          console.log('执行漫画同步任务')
          //漫画同步任务调用
          await new SyncMangaJob(args).run()
          break
        case 'taskSyncChapter':
          console.log('执行章节同步任务')
          //章节同步任务调用
          await new SyncChapterJob(args).run()
        default:
          break
      }

      // 向主进程报告任务完成
      if (process.send) {
        process.send({
          type: 'TASK_COMPLETED',
          taskId: job.id,
          result: { status: 'success', command, args },
        })
      }

      return true
    } catch (error) {
      console.error(`同步任务失败: ${command}`, error)

      // 向主进程报告任务失败
      if (process.send) {
        process.send({
          type: 'TASK_FAILED',
          taskId: job.id,
          command: command,
          error: error.message || String(error),
        })
      }

      throw error
    }
  })

  // 处理默认任务
  scanQueue.process(queueConfig.concurrency, async (job: any) => {
    const { command, args } = job.data
    try {
      // 向主进程报告任务开始
      if (process.send) {
        process.send({
          type: 'TASK_STARTED',
          taskId: job.id,
          command: command,
          data: args,
        })
      }

      switch (command) {
        case 'taskScanPath':
          //扫描任务调用
          console.log('执行扫描任务')
          await new ScanPathJob(args).run()
          break
        case 'taskScanManga':
          console.log('执行扫描漫画任务')
          //扫描漫画任务调用
          await new ScanMangaJob(args).run()
          break
        case 'deleteMedia':
          //删除媒体库
          console.log('删除媒体库')
          await new DeleteMediaJob(args).run()
          break
        case 'deletePath':
          //删除路径
          console.log('删除路径')
          await new DeletePathJob(args).run()
          break
        case 'deleteManga':
          //删除漫画
          console.log('删除漫画')
          await new DeleteMangaJob(args).run()
          break
        case 'deleteChapter':
          //删除章节
          console.log('删除章节')
          await new DeleteChapterJob(args).run()
          break
        case 'copyPoster':
          await new CopyPosterJob(args).run()
          break
        case 'compressChapter':
          //压缩章节
          console.log('压缩章节')
          await new CompressChapterJob(args).run()
          break
        case 'createMediaPoster':
          //生成媒体库封面
          console.log('生成媒体库封面')
          await new CreateMediaPosterJob(args).run()
          break
        case 'reloadMangaMeta':
          //重新加载漫画元数据
          console.log('重新加载漫画元数据')
          await new ReloadMangaMetaJob(args).run()
          break
        default:
          break
      }

      // 向主进程报告任务完成
      if (process.send) {
        process.send({
          type: 'TASK_COMPLETED',
          taskId: job.id,
          result: { status: 'success', command, args },
        })
      }

      return true
    } catch (error) {
      console.error(`默认任务失败: ${command}`, error)

      // 向主进程报告任务失败
      if (process.send) {
        process.send({
          type: 'TASK_FAILED',
          taskId: job.id,
          command: command,
          error: error.message || String(error),
        })
      }

      throw error
    }
  })

  // 监听队列事件
  scanQueue.on('failed', (job, error) => {
    console.error(`任务 ${job.id} 失败`, error)
  })

  scanQueue.on('completed', (job, result) => {
    console.log(`任务 ${job.id} 完成`, result)
  })
}

const deleteQueue = new Bull('smanga', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
})

const compressQueue = new Bull('smanga', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
})

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

// 任务状态跟踪（仅在主进程中使用）
const activeTasks = new Map<string, { taskId: string; command: string; status: 'pending' | 'processing' | 'completed' | 'failed'; workerId?: number }>()

type addTaskType = {
  taskName: string
  command: string
  args: any
  priority?: number
  timeout?: number
}

async function addTask({ taskName, command, args, priority, timeout }: addTaskType) {
  // console.log(`添加任务: ${taskName}, 命令: ${command}, 参数: ${JSON.stringify(args)}, 优先级: ${priority}, 超时: ${timeout}`);
  console.log(`添加任务: ${taskName}`)

  // 才用同步还是异步的方式执行扫描任务
  const config = get_config()
  const dispatchSync = config.debug.dispatchSync == 1
  if (dispatchSync) {
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
        //压缩章节
        await new CompressChapterJob(args).run()
        break
      case 'createMediaPoster':
        await new CreateMediaPosterJob(args).run()
        break
      case 'reloadMangaMeta':
        await new ReloadMangaMetaJob(args).run()
        break
      default:
        break
    }
    return { status: 'success', taskId: 'sync_task' }
  } else {
    if (command === 'taskScanPath') {
      if (await path_scanning(args.pathId)) {
        console.log(`路径${args.pathId} 正在被扫描,跳过执行`)
        return { status: 'skipped', message: `路径${args.pathId} 正在被扫描,跳过执行` }
      }
    } else if (command === 'deletePath') {
      if (await path_deleting(args.pathId)) {
        console.log(`路径${args.pathId} 正在被删除,跳过执行`)
        return { status: 'skipped', message: `路径${args.pathId} 正在被删除,跳过执行` }
      }
    }

    let taskQueue = 'scan'
    if (/sync/.test(taskName)) {
      taskQueue = 'sync'
    } else if (/compress/.test(taskName)) {
      taskQueue = 'compress'
    }

    try {
      const job = await scanQueue.add(
        taskQueue,
        {
          taskName,
          command,
          args,
        },
        {
          priority,
          timeout: queueConfig.timeout, // 使用配置的超时时间
          attempts: queueConfig.attempts, // 最大重试次数
          backoff: {
            type: 'exponential',
            delay: 10 * 1000, // 初始延迟10秒
            options: {
              factor: 2, // 每次延迟翻倍
              jitter: true, // 添加随机抖动，避免并发重试风暴
              maxDelay: 2 * 60 * 1000, // 最大延迟时间（防止无限增长）
            },
          },
        }
      )
      
      // 在主进程中跟踪任务状态
      if (cluster.isMaster) {
        const taskKey = `${command}-${JSON.stringify(args)}`
        activeTasks.set(taskKey, {
          taskId: job.id,
          command,
          status: 'pending'
        })
      }
      
      return { status: 'success', taskId: job.id }
    } catch (error) {
      console.error(`添加任务 ${taskName} 到队列失败`, error)
      return { status: 'error', error: error.message || String(error) }
    }
  }
}

// 获取任务状态
async function getTaskStatus(taskId: string) {
  try {
    // 检查任务是否存在于队列中
    const job = await scanQueue.getJob(taskId)
    if (!job) {
      return { status: 'error', message: 'Task not found' }
    }

    const jobState = await job.getState()
    return { status: 'success', taskStatus: jobState }
  } catch (error) {
    console.error(`获取任务状态失败: ${taskId}`, error)
    return { status: 'error', error: error.message || String(error) }
  }
}

// 停止任务
async function stopTask(taskId: string) {
  try {
    const job = await scanQueue.getJob(taskId)
    if (!job) {
      return { status: 'error', message: 'Task not found' }
    }

    // 尝试移除任务
    await job.remove()
    return { status: 'success', message: 'Task stopped' }
  } catch (error) {
    console.error(`停止任务失败: ${taskId}`, error)
    return { status: 'error', error: error.message || String(error) }
  }
}

export { scanQueue, deleteQueue, compressQueue, addTask, path_scanning, path_deleting, getTaskStatus, stopTask }
