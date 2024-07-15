import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class LogsController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.log.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) { 
        let { logId } = params
        logId = Number(logId)
        const log = await prisma.log.findUnique({ where: { logId } })
        const showResponse = new SResponse({ code: 0, message: '', data: log })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) { 
        const insertData = request.body() as Prisma.logCreateInput;
        const log = await prisma.log.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: log })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) { 
        let { logId } = params
        logId = Number(logId)
        const modifyData = request.body()
        const log = await prisma.log.update({
            where: { logId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: log })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) {
        let { logId } = params
        logId = Number(logId)
        const log = await prisma.log.delete({ where: { logId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: log })
        return response.json(destroyResponse)
    }
}