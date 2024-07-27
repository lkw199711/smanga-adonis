import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class MediaController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.media.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) { 
        let { mediaId } = params
        mediaId = Number(mediaId)
        const media = await prisma.media.findUnique({ where: { mediaId } })
        const showResponse = new SResponse({ code: 0, message: '', data: media })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) { 
        const requestData = request.body();
        const insertData = requestData.data as Prisma.mediaCreateInput
        const media = await prisma.media.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: media })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) { 
        let { mediaId } = params
        mediaId = Number(mediaId)
        const modifyData = request.body()
        const media = await prisma.media.update({
            where: { mediaId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: media })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) { 
        let { mediaId } = params
        mediaId = Number(mediaId)
        const media = await prisma.media.delete({ where: { mediaId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: media })
        return response.json(destroyResponse)
    }
}