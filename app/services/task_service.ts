import prisma from '#start/prisma'
import { Prisma } from '@prisma/client'
import scan_job from './scan_job.js'
import scan_manga_job from './scan_manga_job.js'

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

    // 上锁
    this.sqlLock = true

    const inTaskCount = await prisma.task.count({ where: { status: 'in-progress' } })
    if (inTaskCount >= this.maxConcurrentTasks) {
      this.sqlLock = false
      return
    }

    // 获取任务列表
    let task = await prisma.task.findFirst({
      where: { status: 'pending' },
      orderBy: { priority: 'asc' },
    })

    if (!task) {
      this.sqlLock = false
      return
    };

    // 更新任务状态 执行中
    task = await prisma.task.update({
      where: { taskId: task.taskId },
      data: {
        status: 'in-progress',
        startTime: new Date(),
      },
    })

    this.process(task as TaskType)

    // 下锁
    this.sqlLock = false
  }

  /**
   * 任务执行
   * @param task 任务
   * @returns
   */
  public async process(task: Prisma.taskWhereUniqueInput & Prisma.taskUpdateInput) {
    try {
      switch (task.command) {
        case 'task_scan':
          //扫描任务调用
          console.log('执行扫描任务')
          await scan_job(task.args)
          break
        case 'task_scan_manga':
          console.log('执行扫描漫画任务')
          //扫描漫画任务调用
          await scan_manga_job(task.args)
          break
        default:
          break
      }

      // 更新任务状态 完成
      task.status = 'completed'

      const { taskName, status, command, args, startTime, endTime, error } = task
      const successTask = {
        taskName,
        status,
        command,
        args,
        startTime,
        endTime,
      } as Prisma.task_successCreateInput

      await prisma.task_success.create({
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
      } as Prisma.task_failedCreateInput

      await prisma.task_failed.create({ data: failedTask })
    }

    // 从表中删除任务
    await prisma.task.delete({ where: { taskId: task.taskId } })
  }
}
