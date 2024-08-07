import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { Prisma } from '@prisma/client'

export default class TaskFailedsController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.taskFailed.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) { 
        let { taskFailedId } = params
        taskFailedId = Number(taskFailedId)
        const taskFailed = await prisma.taskFailed.findUnique({ where: { taskId: taskFailedId } })
        const showResponse = new SResponse({ code: 0, message: '', data: taskFailed })
        return response.json(showResponse)
    }
    
    public async create({ request, response }: HttpContext) { 
        const insertData = request.body() as Prisma.taskFailedCreateInput;
        const taskFailed = await prisma.taskFailed.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: taskFailed })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) { 
        let { taskFailedId } = params
        taskFailedId = Number(taskFailedId)
        const modifyData = request.body()
        const taskFailed = await prisma.taskFailed.update({
            where: { taskId: taskFailedId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: taskFailed })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) { 
        let { taskFailedId } = params
        taskFailedId = Number(taskFailedId)
        const taskFailed = await prisma.taskFailed.delete({ where: { taskId: taskFailedId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: taskFailed })
        return response.json(destroyResponse)
    }
}