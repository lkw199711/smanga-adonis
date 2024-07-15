import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class LatestsController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.latest.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) { 
        let { latestId } = params
        latestId = Number(latestId)
        const latest = await prisma.latest.findUnique({ where: { latestId } })
        const showResponse = new SResponse({ code: 0, message: '', data: latest })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) { 
        const insertData = request.body() as Prisma.latestCreateInput;
        const latest = await prisma.latest.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: latest })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) { 
        let { latestId } = params
        latestId = Number(latestId)
        const modifyData = request.body()
        const latest = await prisma.latest.update({
            where: { latestId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: latest })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) { 
        let { latestId } = params
        latestId = Number(latestId)
        const latest = await prisma.latest.delete({ where: { latestId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: latest })
        return response.json(destroyResponse)
    }
}