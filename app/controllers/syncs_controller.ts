import type { HttpContext } from '@adonisjs/core/http'
import { ListResponse, SResponse } from '../interfaces/response.js'
import prisma from '#start/prisma'
import { addTask } from '#services/queue_service'
import { TaskPriority } from '#type/index'
import { download_file } from '#utils/api'
import * as fs from 'fs'

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
        const { syncType, syncName, origin, receivedPath, shareId, link, secret, auto, token } =
            request.only(['syncType', 'syncName', 'origin', 'receivedPath', 'shareId', 'link', 'secret', 'auto', 'token', 'auto'])

        // 路径不存在
        if (!receivedPath || receivedPath.trim() === '') {
            return response.status(400).json(new SResponse({ code: 1, message: '接收路径不能为空', status: 'bad request' }))
        }

        // 
        if (fs.existsSync(receivedPath) === false) {
            return response.status(400).json(new SResponse({ code: 1, message: '接收路径不存在', status: 'bad request' }))
        }

        // 路径无法写入
        try {
            fs.accessSync(receivedPath, fs.constants.W_OK)
        } catch (err) {
            return response.status(400).json(new SResponse({ code: 1, message: '接收路径无法写入，请检查权限', status: 'bad request' }))
        }

        let sync = await prisma.sync.findFirst({
            where: { link }
        })

        if (sync) {
            // return response.status(400).json(new SResponse({ code: 1, message: '该同步链接已存在', status: 'bad request' }))
        }

        let origin1 = origin
        if (/\/api/.test(link)) origin1 = origin + '/api'
        // const fileResponse = await downloadFile('http://127.0.0.1:9798/file', 'A:\\02manga\\04test\\test-8-29\\优香的大屁股2\\00.jpg', './data/temp/tempfile.jpg')
        // console.log('fileResponse', fileResponse)
        // return response.json(new SResponse({ code: 1, message: '下载完成', data: {} }))
        // 这里可以添加创建同步任务的逻辑
        // 例如将数据存储到数据库，或者调用外部API等
        sync = await prisma.sync.create({
            data: {
                syncType,
                syncName,
                origin: origin1,
                receivedPath,
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

        if (syncType === 'media') {
            // 创建媒体同步任务
            addTask({
                taskName: 'sync_media_' + sync.syncId,
                command: 'taskSyncMedia',
                args: { receivedPath, link, origin: origin1 },
                priority: TaskPriority.syncMedia
            })
        } else {
            // 创建漫画同步任务
            addTask({
                taskName: 'sync_manga_' + sync.syncId,
                command: 'taskSyncManga',
                args: { receivedPath, link, origin },
                priority: TaskPriority.syncManga
            })
        }

        // 返回创建成功的响应
        return response.json(new SResponse({ code: 0, message: '同步任务创建成功', data: sync }))
    }

    async update({ params, request, response }: HttpContext) {
        const { syncId } = params
        const { syncType, origin, shareId, link, secret, auto, token } = request.only(['syncType', 'origin', 'mediaId', 'shareId', 'link', 'secret', 'auto', 'token'])

        // 更新同步任务的逻辑
        const sync = await prisma.sync.update({
            where: { syncId },
            data: {
                syncType,
                origin,
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

    async execute({ params, response }: HttpContext) {
        const { syncId } = params
        const sync = await prisma.sync.findUnique({
            where: { syncId },
        })

        if (!sync) {
            return response.status(404).json(new SResponse({ code: 1, message: '同步记录未找到', status: 'not found' }))
        }

        if (sync.syncType === 'media') {
            // 创建媒体同步任务
            addTask({
                taskName: 'sync_media_' + sync.syncId,
                command: 'taskSyncMedia',
                args: { receivedPath: sync.receivedPath, link: sync.link, origin: sync.origin },
                priority: TaskPriority.syncMedia
            })
        } else {
            // 创建漫画同步任务
            addTask({
                taskName: 'sync_manga_' + sync.syncId,
                command: 'taskSyncManga',
                args: { receivedPath: sync.receivedPath, link: sync.link, origin: sync.origin },
                priority: TaskPriority.syncManga
            })
        }

        return response.json(new SResponse({ code: 0, message: '同步任务已加入队列', data: sync }))
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