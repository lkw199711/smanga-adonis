/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:21:43
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-07-15 20:17:04
 * @FilePath: \smanga-adonis\app\controllers\metas_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { Prisma } from '@prisma/client'

export default class MetasController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.meta.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) { 
        let { metaId } = params
        metaId = Number(metaId)
        const meta = await prisma.meta.findUnique({ where: { metaId } })
        const showResponse = new SResponse({ code: 0, message: '', data: meta })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) { 
        const insertData = request.body() as Prisma.metaCreateInput;
        const meta = await prisma.meta.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: meta })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) { 
        let { metaId } = params
        metaId = Number(metaId)
        const modifyData = request.only(['metaKey', 'metaValue']) as Prisma.metaUpdateInput
        const meta = await prisma.meta.update({
            where: { metaId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: meta })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) { 
        let { metaId } = params
        metaId = Number(metaId)
        const meta = await prisma.meta.delete({ where: { metaId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: meta })
        return response.json(destroyResponse)
    }
}