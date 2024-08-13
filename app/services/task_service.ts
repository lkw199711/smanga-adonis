import prisma from '#start/prisma'
import { Prisma } from '@prisma/client'
import scan_job from './scan_job.js'
import scan_manga_job from './scan_manga_job.js'
import delete_chapter_job from './delete_chapter_job.js'
import delete_manga_job from './delete_manga_job.js'
import delete_path_job from './delete_path_job.js'
import delete_media_job from './delete_media_job.js'
import { sql_parse_json } from '../utils/index.js'
import { Mutex } from 'async-mutex'
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
      console.log(err.message)
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
      const argsVal = sql_parse_json(task.args as string)

      switch (task.command) {
        case 'taskScan':
          //扫描任务调用
          console.log('执行扫描任务')
          await scan_job(argsVal)
          break
        case 'taskScanManga':
          console.log('执行扫描漫画任务')
          //扫描漫画任务调用
          await scan_manga_job(argsVal)
          break
        case 'deleteMedia':
          //删除媒体库
          console.log('删除媒体库')
          await delete_media_job(argsVal)
          break
        case 'deletePath':
          //删除路径
          console.log('删除路径')
          await delete_path_job(argsVal)
          break
        case 'deleteManga':
          //删除漫画
          console.log('删除漫画')
          await delete_manga_job(argsVal)
          break
        case 'deleteChapter':
          //删除章节
          console.log('删除章节')
          await delete_chapter_job(argsVal)
          break
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
