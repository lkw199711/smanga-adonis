/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:21:31
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-07-15 20:14:48
 * @FilePath: \smanga-adonis\app\controllers\media_permissons_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class MediaPermissonsController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.media_permisson.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) { 
        let { mediaPermissonId } = params
        mediaPermissonId = Number(mediaPermissonId)
        const mediaPermisson = await prisma.media_permisson.findUnique({ where: { mediaPermissonId } })
        const showResponse = new SResponse({ code: 0, message: '', data: mediaPermisson })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) { 
        const insertData = request.body() as Prisma.media_permissonCreateInput;
        const mediaPermisson = await prisma.media_permisson.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: mediaPermisson })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) {
        let { mediaPermissonId } = params
        mediaPermissonId = Number(mediaPermissonId)
        const modifyData = request.body()
        const mediaPermisson = await prisma.media_permisson.update({
            where: { mediaPermissonId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: mediaPermisson })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) { 
        let { mediaPermissonId } = params
        mediaPermissonId = Number(mediaPermissonId)
        const mediaPermisson = await prisma.media_permisson.delete({ where: { mediaPermissonId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: mediaPermisson })
        return response.json(destroyResponse)
    }
}