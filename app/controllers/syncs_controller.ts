import type { HttpContext } from '@adonisjs/core/http'
import { ListResponse, SResponse } from '../interfaces/response.js'
import prisma from '#start/prisma'
import { addTask } from '#services/queue_service'
import { TaskPriority } from '#type/index'

export default class SyncsController {
    async select({ request, response }: HttpContext) {
        const { page, pageSize } = request.only(['page', 'pageSize'])
        const queryParams = {
            orderBy: { createTime: 'desc' },
            ...(page && {
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        }

        const [list, count] = await Promise.all([
            prisma.sync.findMany(queryParams),
            prisma.sync.count(),
        ])

        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list,
            count,
        })

        return response.json(listResponse)
    }

    async create({ request, response }: HttpContext) {
        const { syncType, source, mediaId, shareId, link, secret, auto, token } = request.only(['syncType', 'source', 'mediaId', 'shareId', 'link', 'secret', 'auto', 'token', 'auto'])

        // 这里可以添加创建同步任务的逻辑
        // 例如将数据存储到数据库，或者调用外部API等
        const sync = await prisma.sync.create({
            data: {
                syncType,
                source,
                media: {
                    connect: { mediaId }
                },
                shareId,
                link,
                secret,
                auto: auto ? 1 : 0, // 将布尔值转换为整数
                token
            },
        })

        if (!sync) {
            return response.status(500).json(new SResponse({ code: 1, message: '同步任务创建失败', status: 'error' }))
        }

        addTask({
            taskName: 'sync_media_' + mediaId,
            command: 'taskSyncMedia',
            args: { source, secret },
            priority: TaskPriority.syncMedia
        })

        // 返回创建成功的响应
        return response.json(new SResponse({ code: 0, message: '同步任务创建成功', data: sync }))
    }

    async update({ params, request, response }: HttpContext) {
        const { syncId } = params
        const { syncType, source, mediaId, shareId, link, secret, auto, token } = request.only(['syncType', 'source', 'mediaId', 'shareId', 'link', 'secret', 'auto', 'token'])

        // 更新同步任务的逻辑
        const sync = await prisma.sync.update({
            where: { syncId },
            data: {
                syncType,
                source,
                media: {
                    connect: { mediaId }
                },
                shareId,
                link,
                secret,
                auto: auto ? 1 : 0, // 将布尔值转换为整数
                token
            },
        })

        if (!sync) {
            return response.status(404).json(new SResponse({ code: 1, message: '同步任务未找到', status: 'not found' }))
        }

        return response.json(new SResponse({ code: 0, message: '同步任务更新成功', data: sync }))
    }

    async destroy({ params, response }: HttpContext) {
        const { syncId } = params

        // 删除同步任务的逻辑
        const sync = await prisma.sync.delete({
            where: { syncId },
        })

        if (!sync) {
            return response.status(404).json(new SResponse({ code: 1, message: '同步记录未找到', status: 'not found' }))
        }

        return response.json(new SResponse({ code: 0, message: '同步记录删除成功', data: sync }))
    }
}