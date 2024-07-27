import prisma from '#start/prisma'
import { Prisma } from '@prisma/client'
import scan_job from './scan_job.js'

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
  private processing = 0
  // 最大并发任务数
  private readonly maxConcurrentTasks = 10

  /**
   * 任务监控
   */
  public async handleTaskQueue() {
    if (this.processing >= this.maxConcurrentTasks) {
      return
    }

    // 获取任务列表
    const tasks = await prisma.task.findMany({
      where: { status: 'pending' },
      orderBy: { priority: 'asc' },
    })

    // 遍历任务列表
    for (const task of tasks) {
      if (this.processing >= this.maxConcurrentTasks) {
        break
      }

      this.processing++
      try {
        await this.process(task as TaskType)
      } finally {
        this.processing--
      }
    }
  }

  /**
   * 任务执行
   * @param task 任务
   * @returns
   */
  public async process(task: Prisma.taskWhereUniqueInput & Prisma.taskUpdateInput) {
    // 任务状态开始
    task.status = 'in-progress'
    // 任务开始时间
    task.startTime = new Date()
    // 更新任务状态 执行中
    await prisma.task.update({
      where: { taskId: task.taskId },
      data: task,
    })

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
          //await this.scanMangaJob.handle(task.args);
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
