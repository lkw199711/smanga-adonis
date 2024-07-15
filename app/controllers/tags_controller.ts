/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:22:15
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-07-15 20:22:45
 * @FilePath: \smanga-adonis\app\controllers\tags_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class TagsController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.tag.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) { 
        let { tagId } = params
        tagId = Number(tagId)
        const tag = await prisma.tag.findUnique({ where: { tagId } })
        const showResponse = new SResponse({ code: 0, message: '', data: tag })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) { 
        const insertData = request.body() as Prisma.tagCreateInput;
        const tag = await prisma.tag.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: tag })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) { 
        let { tagId } = params
        tagId = Number(tagId)
        const modifyData = request.body()
        const tag = await prisma.tag.update({
            where: { tagId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: tag })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) { 
        let { tagId } = params
        tagId = Number(tagId)
        const tag = await prisma.tag.delete({ where: { tagId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: tag })
        return response.json(destroyResponse)
    }
}