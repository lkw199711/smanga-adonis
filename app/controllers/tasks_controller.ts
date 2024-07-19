/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:22:21
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-07-16 21:39:09
 * @FilePath: \smanga-adonis\app\controllers\tasks_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class TasksController {
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
          console.log("执行扫描任务");
          
          //await this.scanJob.handle(task.args);
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

      const successTask = task as Prisma.task_successCreateInput
      await prisma.task_success.create({ data: successTask })
    } catch (error) {
      // dev-log
      // 更新任务状态 失败
      task.status = 'failed'
      task.error = error.message
      const failedTask = task as Prisma.task_failedCreateInput
      await prisma.task_failed.create({ data: failedTask })
    }

    // 从表中删除任务
    await prisma.task.delete({ where: { taskId: task.taskId } })
  }
  public async index({ response }: HttpContext) {
    const list = await prisma.task.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { taskId } = params
    taskId = Number(taskId)
    const task = await prisma.task.findUnique({ where: { taskId } })
    const showResponse = new SResponse({ code: 0, message: '', data: task })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = request.body() as Prisma.taskCreateInput
    const task = await prisma.task.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: task })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { taskId } = params
    taskId = Number(taskId)
    const modifyData = request.body()
    const task = await prisma.task.update({
      where: { taskId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: task })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { taskId } = params
    taskId = Number(taskId)
    const task = await prisma.task.delete({ where: { taskId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: task })
    return response.json(destroyResponse)
  }
}
