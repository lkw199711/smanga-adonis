/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:22:21
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-06 00:24:39
 * @FilePath: \smanga-adonis\app\controllers\tasks_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { Prisma } from '@prisma/client'
import { scanQueue } from '#services/queue_service'

export default class TasksController {
  async select({ request, response }: HttpContext) {
    // const list = await scanQueue.getJobs(['active', 'waiting', 'completed', 'failed', 'delayed'])
    const list = await scanQueue.getJobs(['active', 'waiting'])
    // const count = await scanQueue.getJobCountByTypes(['active', 'waiting'])
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  async show({ params, response }: HttpContext) {
    const { taskId } = params
    const job = await scanQueue.getJob(taskId)

    if (!job) {
      return response.status(404).json(new SResponse({ code: 1, message: '任务未找到', status: 'not found' }))
    }

    return response.json(new SResponse({ code: 0, message: '', data: job }))
  }

  async destroy({ params, response }: HttpContext) {
    const { taskId } = params
    const job = await scanQueue.getJob(taskId)

    if (!job) {
      return response.status(404).json(new SResponse({ code: 1, message: '任务未找到', status: 'not found' }))
    }

    await job.remove()
    return response.json(new SResponse({ code: 0, message: '任务已删除', status: 'success' }))
  }

  async destroy_all({ response }: HttpContext) {
    // await scanQueue.empty() // 清空队列中的所有任务
    await scanQueue.clean(0) // 清除所有任务，包括已完成和失败的任务
    return response.json(new SResponse({ code: 0, message: '任务已清空', status: 'success' }))
  }
}
