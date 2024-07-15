import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'

export default class LoginController {
    public async index({ response }: HttpContext) { 
        const list = await prisma.login.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) { 
        let { loginId } = params
        loginId = Number(loginId)
        const login = await prisma.login.findUnique({ where: { loginId } })
        const showResponse = new SResponse({ code: 0, message: '', data: login })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) { 
        const insertData = request.body() as Prisma.loginCreateInput;
        const login = await prisma.login.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: login })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) { 
        let { loginId } = params
        loginId = Number(loginId)
        const modifyData = request.body()
        const login = await prisma.login.update({
            where: { loginId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: login })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) { 
        let { loginId } = params
        loginId = Number(loginId)
        const login = await prisma.login.delete({ where: { loginId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: login })
        return response.json(destroyResponse)
    }
}