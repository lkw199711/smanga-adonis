import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { v4 as uuidv4 } from 'uuid'
import { media as mediaType } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { image_files } from '#utils/index'
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
        const { mediaId, mangaId, expires, origin, shareName } = request.only(['mangaId', 'mediaId', 'domain', 'expires', 'origin', 'shareName'])
        const shareType = mangaId ? 'manga' : 'media'
        const secret = uuidv4()
        const link = `${origin}/api/analysis?secret=${secret}`

        const expiresDate = new Date();
        if (expires) {
            expiresDate.setDate(expiresDate.getDate() + expires);
        } else {
            expiresDate.setFullYear(expiresDate.getFullYear() + 1); // 默认设置为一年后过期
        }

        const share = await prisma.share.create({
            data: {
                shareType,
                shareName,
                user: { connect: { userId } },
                media: { connect: { mediaId } },
                manga: mangaId ? { connect: { mangaId } } : undefined,
                expires: expiresDate,
                origin,
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

    async destroy_batch({ params, response }: HttpContext) {
        const { shareIds } = params
        const shareIdsArray = shareIds.split(',')
        await prisma.share.deleteMany({
            where: {
                shareId: {
                    in: shareIdsArray
                }
            }
        })
        return response.json(new SResponse({ code: 0, message: '分享已删除', status: 'success' }))
    }

    async analysis({ request, response }: HttpContext) {
        const { secret, mangaId, chapterId } = request.only(['secret', 'mangaId', 'chapterId'])
        let media: mediaType & { mangaCount?: number } | null | void = null;
        let manga: any = null;

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

        // 如果传了 mangaId，优先返回该漫画的章节信息
        if (mangaId) {
            const manga = await prisma.manga.findUnique({
                where: { mangaId },
                include: { media: true },
            })

            if (!manga) {
                return response.status(404).json(new SResponse({ code: 1, message: '漫画未找到', status: 'manga not found' }))
            }

            const sourceWebsite = manga.media.sourceWebsite
            const chapters = await prisma.chapter.findMany({
                where: { mangaId },
                orderBy: { chapterNumber: 'asc' },
            })

            // 检查章节是否有外置封面
            chapters.forEach((chapter) => {
                const dirOutExt = chapter.chapterPath.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '');

                if (sourceWebsite === 'toptoon') {
                    chapter.outCovers = [`${dirOutExt}.jpg`, `${dirOutExt}-1.jpg`]
                    return;
                }

                if (sourceWebsite === 'toomics') {
                    chapter.outCovers = [`${dirOutExt}.jpg`]
                    return;
                }

                const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP'];
                extensions.some((ext) => {
                    const picPath = dirOutExt + ext
                    if (fs.existsSync(picPath)) {
                        chapter.outCovers = [picPath]
                        return true
                    }
                })
            })

            const listResponse = new ListResponse({
                code: 0,
                message: '章节列表获取成功',
                list: chapters,
                count: chapters.length,
            })
            return response.json(listResponse)
        }

        // 如果传了 chapterId，返回该章节的详细信息
        if (chapterId) {
            const chapter = await prisma.chapter.findUnique({
                where: { chapterId },
            })
            if (!chapter) {
                return response.status(404).json(new SResponse({ code: 1, message: '章节未找到', status: 'chapter not found' }))
            }
            const images = image_files(chapter.chapterPath)
            const listResponse = new ListResponse({
                code: 0,
                message: '章节信息获取成功',
                list: images,
                count: images.length,
            })
            return response.json(listResponse)
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
                include: {
                    media: {
                        select: {
                            mediaId: true,
                            mediaName: true,
                            mediaType: true,
                        },
                    },
                    metas: true,
                },
            })

            if (!manga) {
                return response.status(404).json(new SResponse({ code: 1, message: '漫画未找到', status: 'manga not found' }))
            }

            const dirOutExt = manga.mangaPath.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
            const dirMeta = dirOutExt + '-smanga-info'

            const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP'];
            extensions.some((ext) => {
                const picPath = dirOutExt + ext
                if (fs.existsSync(picPath)) {
                    manga.outCovers = [picPath]
                    return true
                }
            })

            // 有元数据文件
            if (fs.existsSync(dirMeta)) {
                const metaFiles = fs.readdirSync(dirMeta, 'utf-8');
                manga.metaFiles = metaFiles.map(file => path.join(dirMeta, file));
            }
        }
        // 这里可以添加分析逻辑
        // 例如统计访问次数、获取用户信息等

        return response.json(new SResponse({ code: 0, message: '分析成功', data: { share, media, manga } }))
    }

    async analysis_chapters({ request, response }: HttpContext) {
        const { mangaId } = request.only(['secret', 'mangaId', 'chapterId'])

        const manga = await prisma.manga.findUnique({
            where: { mangaId },
            include: { media: true },
        })

        if (!manga) {
            return response.status(404).json(new SResponse({ code: 1, message: '漫画未找到', status: 'manga not found' }))
        }

        const sourceWebsite = manga.media.sourceWebsite
        const chapters = await prisma.chapter.findMany({
            where: { mangaId },
            orderBy: { chapterNumber: 'asc' },
        })

        // 检查章节是否有外置封面
        chapters.forEach((chapter) => {
            const dirOutExt = chapter.chapterPath.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '');

            if (sourceWebsite === 'toptoon') {
                chapter.outCovers = [`${dirOutExt}.jpg`, `${dirOutExt}-1.jpg`]
                return;
            }

            if (sourceWebsite === 'toomics') {
                chapter.outCovers = [`${dirOutExt}.jpg`]
                return;
            }

            const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP'];
            extensions.some((ext) => {
                const picPath = dirOutExt + ext
                if (fs.existsSync(picPath)) {
                    chapter.outCovers = [picPath]
                    return true
                }
            })
        })

        const listResponse = new ListResponse({
            code: 0,
            message: '章节列表获取成功',
            list: chapters,
            count: chapters.length,
        })
        return response.json(listResponse)
    }

    async analysis_images({ request, response }: HttpContext) {
        const { chapterId } = request.only(['chapterId'])
        const chapter = await prisma.chapter.findUnique({
            where: { chapterId },
        })
        if (!chapter) {
            return response.status(404).json(new SResponse({ code: 1, message: '章节未找到', status: 'chapter not found' }))
        }
        const images = image_files(chapter.chapterPath)
        const listResponse = new ListResponse({
            code: 0,
            message: '章节信息获取成功',
            list: images,
            count: images.length,
        })
        return response.json(listResponse)
    }

    async analysis_mangas({ request, response }: HttpContext) {
        const { mediaId } = request.only(['mediaId'])

        const mangas = await prisma.manga.findMany({
            where: { mediaId },
            orderBy: { mangaName: 'asc' },
            include: {
                media: {
                    select: {
                        mediaId: true,
                        mediaName: true,
                        mediaType: true,
                    },
                },
                metas: true,
            },
        })

        mangas.forEach((manga) => {
            const dirOutExt = manga.mangaPath.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
            const dirMeta = dirOutExt + '-smanga-info'

            const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP'];
            extensions.some((ext) => {
                const picPath = dirOutExt + ext
                if (fs.existsSync(picPath)) {
                    manga.outCovers = [picPath]
                    return true
                }
            })

            // 有元数据文件
            if (fs.existsSync(dirMeta)) {
                const metaFiles = fs.readdirSync(dirMeta, 'utf-8');
                manga.metaFiles = metaFiles.map(file => path.join(dirMeta, file));
            }
        })

        const listResponse = new ListResponse({
            code: 0,
            message: '漫画列表获取成功',
            list: mangas,
            count: mangas.length,
        })
        return response.json(listResponse)
    }
}