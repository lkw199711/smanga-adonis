import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { v4 as uuidv4 } from 'uuid'
import { media as mediaType } from '@prisma/client'
export default class SharesController {
    async index({ request, response }: HttpContext) {
        const { page, pageSize } = request.only(['page', 'pageSize'])
        const queryParams = {
            orderBy: { createTime: 'desc' },
            ...(page && {
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        }
        const shares = await prisma.share.findMany(queryParams)
        const count = await prisma.share.count()
        const listResponse = new ListResponse({
            code: 0,
            message: '',
            list: shares,
            count,
        })
        return response.json(listResponse)
    }

    async show({ params, response }: HttpContext) {
        const { shareId } = params
        const share = await prisma.share.findUnique({
            where: { shareId },
            include: {
                user: {
                    select: {
                        userName: true,
                    },
                },
            },
        })

        if (!share) {
            return response.status(404).json(new SResponse({ code: 1, message: '分享未找到', status: 'not found' }))
        }

        return response.json(new SResponse({ code: 0, message: '', data: share }))
    }

    async create({ request, response }: HttpContext) {
        const { userId } = request as any
        const { mediaId, mangaId, domain, expires, source } = request.only(['mangaId', 'mediaId', 'domain', 'expires', 'source'])
        const shareType = mangaId ? 'manga' : 'media'
        const secret = uuidv4()
        const link = `${source}/api/analysis?secret=${secret}`

        const expiresDate = new Date();
        if (expires) {
            expiresDate.setDate(expiresDate.getDate() + expires);
        } else {
            expiresDate.setFullYear(expiresDate.getFullYear() + 1); // 默认设置为一年后过期
        }

        const share = await prisma.share.create({
            data: {
                shareType,
                user: { connect: { userId } },
                media: { connect: { mediaId } },
                manga: mangaId ? { connect: { mangaId } } : undefined,
                expires: expiresDate,
                source,
                secret,
                link,
            },
        })
        return response.json(new SResponse({ code: 0, message: '分享创建成功', data: share }))
    }

    async update({ params, request, response }: HttpContext) {
        const { shareId } = params
        const { mediaId, mangaId } = request.only(['mangaId', 'mediaId'])
        const share = await prisma.share.update({
            where: { shareId },
            data: {
                mediaId,
                mangaId,
            },
        })
        return response.json(new SResponse({ code: 0, message: '分享更新成功', data: share }))
    }

    async destroy({ params, response }: HttpContext) {
        const { shareId } = params
        const share = await prisma.share.findUnique({ where: { shareId } })

        if (!share) {
            return response.status(404).json(new SResponse({ code: 1, message: '分享未找到', status: 'not found' }))
        }

        await prisma.share.delete({ where: { shareId } })
        return response.json(new SResponse({ code: 0, message: '分享已删除', status: 'success' }))
    }

    async analysis({ request, response }: HttpContext) {
        const { secret } = request.only(['secret'])
        let media: mediaType & { mangaCount?: number } | null | void = null;
        let manga = null;

        const share = await prisma.share.findFirst({
            where: { secret },
        })

        if (!share) {
            return response.status(404).json(new SResponse({ code: 1, message: '分享未找到', status: 'not found' }))
        }

        if (share.enable === 0) {
            return response.status(403).json(new SResponse({ code: 1, message: '分享已禁用', status: 'share disabled' }))
        }

        // 分享已过期
        if (share.expires && new Date(share.expires) < new Date()) {
            return response.status(403).json(new SResponse({ code: 1, message: '分享已过期', status: 'share expired' }))
        }

        if (share.shareType === 'media') {
            media = await prisma.media.findUnique({
                where: { mediaId: share.mediaId },
            })

            if (!media) {
                return response.status(404).json(new SResponse({ code: 1, message: '媒体未找到', status: 'media not found' }))
            }

            media.mangaCount = await prisma.manga.count({
                where: { mediaId: share.mediaId },
            })
        } else if (share.shareType === 'manga' && share.mangaId) {
            manga = await prisma.manga.findUnique({
                where: { mangaId: share.mangaId },
            })
        }
        // 这里可以添加分析逻辑
        // 例如统计访问次数、获取用户信息等

        return response.json(new SResponse({ code: 0, message: '分析成功', data: { share, media, manga } }))
    }
}