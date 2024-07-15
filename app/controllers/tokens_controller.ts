/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:22:52
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-07-15 20:30:12
 * @FilePath: \smanga-adonis\app\controllers\tokens_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class TokensController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.token.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) { 
        let { tokenId } = params
        tokenId = Number(tokenId)
        const token = await prisma.token.findUnique({ where: { tokenId } })
        const showResponse = new SResponse({ code: 0, message: '', data: token })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) { 
        const insertData = request.body() as Prisma.tokenCreateInput;
        const token = await prisma.token.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: token })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) { 
        let { tokenId } = params
        tokenId = Number(tokenId)
        const modifyData = request.body()
        const token = await prisma.token.update({
            where: { tokenId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: token })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) { 
        let { tokenId } = params
        tokenId = Number(tokenId)
        const token = await prisma.token.delete({ where: { tokenId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: token })
        return response.json(destroyResponse)
    }
}