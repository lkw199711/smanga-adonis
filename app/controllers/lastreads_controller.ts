import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class LastreadsController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.lastread.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) { 
        let { lastReadId } = params
        lastReadId = Number(lastReadId)
        const lastread = await prisma.lastread.findUnique({ where: { lastReadId } })
        const showResponse = new SResponse({ code: 0, message: '', data: lastread })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) { 
        const insertData: Prisma.lastreadCreateInput = request.only([
          'page',
          'finish',
          'mangaId',
          'chapterId',
          'userId',
        ])
        const lastread = await prisma.lastread.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: lastread })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) { 
        let { lastReadId } = params
        lastReadId = Number(lastReadId)
        const modifyData = request.body()
        const lastread = await prisma.lastread.update({
            where: { lastReadId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: lastread })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) { 
        let { lastReadId } = params
        lastReadId = Number(lastReadId)
        const lastread = await prisma.lastread.delete({ where: { lastReadId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: lastread })
        return response.json(destroyResponse)
    }
}