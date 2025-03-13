import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { Prisma } from '@prisma/client'

export default class TaskSuccessesController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.taskSuccess.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) { 
        let { taskSuccessId } = params
        taskSuccessId = Number(taskSuccessId)
        const taskSuccess = await prisma.taskSuccess.findUnique({ where: { taskId: taskSuccessId } })
        const showResponse = new SResponse({ code: 0, message: '', data: taskSuccess })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) { 
        const insertData = request.body() as Prisma.taskSuccessCreateInput;
        const taskSuccess = await prisma.taskSuccess.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: taskSuccess })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) { 
        let { taskSuccessId } = params
        taskSuccessId = Number(taskSuccessId)
        const modifyData = request.only(['taskId', 'taskName', 'taskStatus', 'taskType', 'taskTime', 'taskMessage']) as Prisma.taskSuccessUpdateInput
        const taskSuccess = await prisma.taskSuccess.update({
            where: { taskId: taskSuccessId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: taskSuccess })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) { 
        let { taskSuccessId } = params
        taskSuccessId = Number(taskSuccessId)
        const taskSuccess = await prisma.taskSuccess.delete({ where: { taskId: taskSuccessId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: taskSuccess })
        return response.json(destroyResponse)
    }
}