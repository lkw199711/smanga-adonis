import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class TaskSuccessesController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.task_success.findMany()
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
        const taskSuccess = await prisma.task_success.findUnique({ where: { taskId: taskSuccessId } })
        const showResponse = new SResponse({ code: 0, message: '', data: taskSuccess })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) { 
        const insertData = request.body() as Prisma.task_successCreateInput;
        const taskSuccess = await prisma.task_success.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: taskSuccess })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) { 
        let { taskSuccessId } = params
        taskSuccessId = Number(taskSuccessId)
        const modifyData = request.body()
        const taskSuccess = await prisma.task_success.update({
            where: { taskId: taskSuccessId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: taskSuccess })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) { 
        let { taskSuccessId } = params
        taskSuccessId = Number(taskSuccessId)
        const taskSuccess = await prisma.task_success.delete({ where: { taskId: taskSuccessId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: taskSuccess })
        return response.json(destroyResponse)
    }
}