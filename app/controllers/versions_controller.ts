/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-10-08 15:36:23
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-03-13 22:44:45
 * @FilePath: \smanga-adonis\app\controllers\versions_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { Prisma } from '@prisma/client'

export default class VersionsController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.version.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) { 
        let { versionId } = params
        versionId = Number(versionId)
        const version = await prisma.version.findUnique({ where: { versionId } })
        const showResponse = new SResponse({ code: 0, message: '', data: version })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) { 
        const insertData = request.body() as Prisma.versionCreateInput;
        const version = await prisma.version.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: version })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) { 
        let { versionId } = params
        versionId = Number(versionId)
        const modifyData = request.only(['versionName', 'versionStatus', 'versionType', 'versionContent']) as Prisma.versionUpdateInput
        const version = await prisma.version.update({
            where: { versionId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: version })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) { 
        let { versionId } = params
        versionId = Number(versionId)
        const version = await prisma.version.delete({ where: { versionId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: version })
        return response.json(destroyResponse)
    }
}