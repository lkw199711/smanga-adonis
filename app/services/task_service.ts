import prisma from '#start/prisma'
import { Prisma } from '@prisma/client'
import scan_job from './scan_job.js'
import scan_manga_job from './scan_manga_job.js'
import delete_chapter_job from './delete_chapter_job.js'
import delete_manga_job from './delete_manga_job.js'
import delete_path_job from './delete_path_job.js'
import delete_media_job from './delete_media_job.js'
import copy_poster_job from './copy_poster_job.js'
import { sql_parse_json } from '../utils/index.js'
import { Mutex } from 'async-mutex'
import log from '#services/log_service'
const mutex = new Mutex()

type TaskType = Prisma.taskWhereUniqueInput & Prisma.taskUpdateInput

/**
 * 任务处理类
 * 用于处理任务队列中的任务
 * 任务队列中的任务会按照优先级排序
 * 优先级越高的任务越先执行
 * 任务执行完毕后会从任务队列中删除
 * 任务执行失败会记录失败原因
 * 任务执行成功会记录成功日志
 */
export default class TaskProcess {
  // 执行中的任务数量
  // private processing = 0
  // 最大并发任务数
  private readonly maxConcurrentTasks = 1
  // 事务锁
  private sqlLock = false

  /**
   * 任务监控
   */
  public async handleTaskQueue() {
    if (this.sqlLock) {
      return
    }

    const release = await mutex.acquire()

    // 上锁
    this.sqlLock = true

    const inTaskCount = await prisma.task.count({ where: { status: 'in-progress' } })
    if (inTaskCount >= this.maxConcurrentTasks) {
      release()
      this.sqlLock = false
      return
    }

    // 获取任务列表
    let task = await prisma.task.findFirst({
      where: { status: 'pending' },
      orderBy: { priority: 'asc' },
    })

    if (!task) {
      release()
      this.sqlLock = false
      return
    }

    // 更新任务状态 执行中
    task = await prisma.task.update({
      where: { taskId: task.taskId },
      data: {
        status: 'in-progress',
        startTime: new Date(),
      },
    })

    try {
      await this.process(task as TaskType)
    } catch (err) {
      void log.error({
        type: 'task',
        module: 'task',
        action: 'task.process.failed',
        message: `task process failed: ${(err as any)?.message || err}`,
        error: err,
        context: { taskId: task.taskId, taskName: task.taskName, command: task.command },
      })
      release()
    } finally {
      release()
      // 下锁
      this.sqlLock = false
    }
  }

  /**
   * 任务执行
   * @param task 任务
   * @returns
   */
  public async process(task: Prisma.taskWhereUniqueInput & Prisma.taskUpdateInput) {
    try {
      const argsVal = sql_parse_json(task.args as string) as any

      switch (task.command) {
        case 'taskScanPath':
          //扫描任务调用
          void log.info({
            type: 'task',
            module: 'task',
            action: 'task.scan_path.started',
            message: '执行扫描任务',
            context: { taskId: task.taskId, taskName: task.taskName },
          })
          await new scan_job(argsVal).run()
          break
        case 'taskScanManga':
          void log.info({
            type: 'task',
            module: 'task',
            action: 'task.scan_manga.started',
            message: '执行扫描漫画任务',
            context: { taskId: task.taskId, taskName: task.taskName },
          })
          //扫描漫画任务调用
          await new scan_manga_job(argsVal).run()
          break
        case 'deleteMedia':
          //删除媒体库
          void log.info({
            type: 'task',
            module: 'task',
            action: 'task.delete_media.started',
            message: '删除媒体库',
            context: { taskId: task.taskId, taskName: task.taskName },
          })
          await new delete_media_job(argsVal).run()
          break
        case 'deletePath':
          //删除路径
          void log.info({
            type: 'task',
            module: 'task',
            action: 'task.delete_path.started',
            message: '删除路径',
            context: { taskId: task.taskId, taskName: task.taskName },
          })
          await new delete_path_job(argsVal).run()
          break
        case 'deleteManga':
          //删除漫画
          void log.info({
            type: 'task',
            module: 'task',
            action: 'task.delete_manga.started',
            message: '删除漫画',
            context: { taskId: task.taskId, taskName: task.taskName },
          })
          await new delete_manga_job(argsVal).run()
          break
        case 'deleteChapter':
          //删除章节
          void log.info({
            type: 'task',
            module: 'task',
            action: 'task.delete_chapter.started',
            message: '删除章节',
            context: { taskId: task.taskId, taskName: task.taskName },
          })
          await new delete_chapter_job(argsVal).run()
          break
        case 'copyPoster':
          await new copy_poster_job(argsVal).run();
        default:
          break
      }

      // 更新任务状态 完成
      task.status = 'completed'

      const { taskName, status, command, args, startTime, endTime } = task
      const successTask = {
        taskName,
        status,
        command,
        args,
        startTime,
        endTime,
      } as Prisma.taskSuccessCreateInput

      await prisma.taskSuccess.create({
        data: successTask,
      })
    } catch (catchError) {
      // dev-log
      // 更新任务状态 失败
      task.status = 'failed'
      task.error = catchError.message
      const { taskName, status, command, args, startTime, endTime, error } = task
      const failedTask = {
        taskName,
        status,
        command,
        args,
        startTime,
        endTime,
        error,
      } as Prisma.taskFailedCreateInput

      await prisma.taskFailed.create({ data: failedTask })
    }

    // 从表中删除任务
    await prisma.task.delete({ where: { taskId: task.taskId } })
  }
}
