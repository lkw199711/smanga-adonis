/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-10-08 15:36:23
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-03-13 22:42:14
 * @FilePath: \smanga-adonis\app\controllers\scans_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { Prisma } from '@prisma/client'

export default class ScansController {
    public async index({ response }: HttpContext) {
        const list = await prisma.scan.findMany()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count: list.length,
        })
        return response.json(listResponse)
    }

    public async show({ params, response }: HttpContext) {
        let { scanId } = params
        scanId = Number(scanId)
        const scan = await prisma.scan.findFirst({
            where: {
                scanId
            }
        })
        const showResponse = new SResponse({ code: 0, message: '', data: scan })
        return response.json(showResponse)
    }

    public async create({ request, response }: HttpContext) {
        const insertData = request.body() as Prisma.scanCreateInput;
        const scan = await prisma.scan.create({
            data: insertData,
        })
        const saveResponse = new SResponse({ code: 0, message: '新增成功', data: scan })
        return response.json(saveResponse)
    }

    public async update({ params, request, response }: HttpContext) {
        let { scanId } = params
        scanId = Number(scanId)
        const modifyData = request.only(['scanName', 'scanStatus', 'scanType']) as Prisma.scanUpdateInput
        const scan = await prisma.scan.updateMany({
            where: { scanId },
            data: modifyData,
        })
        const updateResponse = new SResponse({ code: 0, message: '更新成功', data: scan })
        return response.json(updateResponse)
    }

    public async destroy({ params, response }: HttpContext) {
        let { scanId } = params
        scanId = Number(scanId)
        const scan = await prisma.scan.deleteMany({ where: { scanId } })
        const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: scan })
        return response.json(destroyResponse)
    }
}