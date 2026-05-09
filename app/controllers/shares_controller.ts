import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import { v4 as uuidv4 } from 'uuid'
import { media as mediaType } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { image_files } from '#utils/index'
import {
  listShareValidator,
  idParamShareValidator,
  createShareValidator,
  updateShareValidator,
  batchIdsParamShareValidator,
  analysisShareValidator,
  analysisChaptersShareValidator,
  analysisImagesShareValidator,
  analysisMangasShareValidator,
} from '#validators/share'

export default class SharesController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response
        .status(403)
        .json(new SResponse({ code: 403, message: '无权限', status: 'no permission' }))
      return false
    }
    return true
  }

  async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { page, pageSize } = await listShareValidator.validate(request.qs())
    const queryParams = {
      orderBy: { createTime: 'desc' as const },
      ...(page && pageSize && { skip: (page - 1) * pageSize, take: pageSize }),
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
    const { shareId } = await idParamShareValidator.validate(params)
    const share = await prisma.share.findUnique({
      where: { shareId },
      include: {
        user: {
          select: { userName: true },
        },
      },
    })

    if (!share) {
      return response
        .status(404)
        .json(new SResponse({ code: 1, message: '分享未找到', status: 'not found' }))
    }

    return response.json(new SResponse({ code: 0, message: '', data: share }))
  }

  async create({ request, response }: HttpContext) {
    const { userId } = request as any
    const { mediaId, mangaId, expires, origin, shareName } = await createShareValidator.validate(
      request.all()
    )
    const shareType = mangaId ? 'manga' : 'media'
    const secret = uuidv4()
    const link = `${origin}/api/analysis?secret=${secret}`

    const expiresDate = new Date()
    if (expires) {
      expiresDate.setDate(expiresDate.getDate() + expires)
    } else {
      expiresDate.setFullYear(expiresDate.getFullYear() + 1) // 默认设置为一年后过期
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
      } as any,
    })
    return response.json(new SResponse({ code: 0, message: '分享创建成功', data: share }))
  }

  async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { shareId } = await idParamShareValidator.validate(params)
    const { mediaId, mangaId } = await updateShareValidator.validate(request.all())
    const share = await prisma.share.update({
      where: { shareId },
      data: {
        mediaId,
        mangaId,
      },
    })
    return response.json(new SResponse({ code: 0, message: '分享更新成功', data: share }))
  }

  async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { shareId } = await idParamShareValidator.validate(params)
    const share = await prisma.share.findUnique({ where: { shareId } })

    if (!share) {
      return response
        .status(404)
        .json(new SResponse({ code: 1, message: '分享未找到', status: 'not found' }))
    }

    await prisma.share.delete({ where: { shareId } })
    return response.json(new SResponse({ code: 0, message: '分享已删除', status: 'success' }))
  }

  async destroy_batch({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { shareIds } = await batchIdsParamShareValidator.validate(params)
    await prisma.share.deleteMany({
      where: {
        shareId: { in: shareIds },
      },
    })
    return response.json(new SResponse({ code: 0, message: '分享已删除', status: 'success' }))
  }

  async analysis({ request, response }: HttpContext) {
    const { secret, mangaId, chapterId } = await analysisShareValidator.validate(request.all())
    let media: (mediaType & { mangaCount?: number }) | null | void = null
    let manga: any = null

    const share = await prisma.share.findFirst({
      where: { secret },
    })

    if (!share) {
      return response
        .status(404)
        .json(new SResponse({ code: 1, message: '分享未找到', status: 'not found' }))
    }

    if (share.enable === 0) {
      return response
        .status(403)
        .json(new SResponse({ code: 1, message: '分享已禁用', status: 'share disabled' }))
    }

    // 分享已过期
    if (share.expires && new Date(share.expires) < new Date()) {
      return response
        .status(403)
        .json(new SResponse({ code: 1, message: '分享已过期', status: 'share expired' }))
    }

    // 如果传了 mangaId，优先返回该漫画的章节信息
    if (mangaId) {
      const mangaFound = await prisma.manga.findUnique({
        where: { mangaId },
        include: { media: true },
      })

      if (!mangaFound) {
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: '漫画未找到', status: 'manga not found' }))
      }

      const sourceWebsite = mangaFound.media.sourceWebsite
      const chapters = await prisma.chapter.findMany({
        where: { mangaId },
        orderBy: { chapterNumber: 'asc' },
      })

      // 检查章节是否有外置封面
      chapters.forEach((chapter: any) => {
        const dirOutExt = chapter.chapterPath.replace(
          /(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i,
          ''
        )

        if (sourceWebsite === 'toptoon') {
          chapter.outCovers = [`${dirOutExt}.jpg`, `${dirOutExt}-1.jpg`]
          return
        }

        if (sourceWebsite === 'toomics') {
          chapter.outCovers = [`${dirOutExt}.jpg`]
          return
        }

        const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP']
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
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: '章节未找到', status: 'chapter not found' }))
      }
      const images = (() => {
        try {
          return image_files(chapter.chapterPath)
        } catch {
          return []
        }
      })()
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
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: '媒体未找到', status: 'media not found' }))
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
        return response
          .status(404)
          .json(new SResponse({ code: 1, message: '漫画未找到', status: 'manga not found' }))
      }

      const dirOutExt = manga.mangaPath.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
      const dirMeta = dirOutExt + '-smanga-info'
      const dirMetaNew = dirOutExt + '/.smanga'

      const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP']
      extensions.some((ext) => {
        const picPath = dirOutExt + ext
        if (fs.existsSync(picPath)) {
          manga.outCovers = [picPath]
          return true
        }
      })

      // 有元数据文件
      if (fs.existsSync(dirMeta)) {
        const metaFiles = fs.readdirSync(dirMeta, 'utf-8')
        manga.metaFiles = metaFiles.map((file) => path.join(dirMeta, file))
      }
      if (fs.existsSync(dirMetaNew)) {
        const metaFiles = fs.readdirSync(dirMetaNew, 'utf-8')
        manga.metaFiles = metaFiles.map((file) => path.join(dirMetaNew, file))
      }
    }

    return response.json(
      new SResponse({ code: 0, message: '分析成功', data: { share, media, manga } })
    )
  }

  async analysis_chapters({ request, response }: HttpContext) {
    const { mangaId } = await analysisChaptersShareValidator.validate(request.all())

    const manga = await prisma.manga.findUnique({
      where: { mangaId },
      include: { media: true },
    })

    if (!manga) {
      return response
        .status(404)
        .json(new SResponse({ code: 1, message: '漫画未找到', status: 'manga not found' }))
    }

    const sourceWebsite = manga.media.sourceWebsite
    const chapters = await prisma.chapter.findMany({
      where: { mangaId },
      orderBy: { chapterNumber: 'asc' },
    })

    // 检查章节是否有外置封面
    chapters.forEach((chapter: any) => {
      const dirOutExt = chapter.chapterPath.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')

      if (sourceWebsite === 'toptoon') {
        chapter.outCovers = [`${dirOutExt}.jpg`, `${dirOutExt}-1.jpg`]
        return
      }

      if (sourceWebsite === 'toomics') {
        chapter.outCovers = [`${dirOutExt}.jpg`]
        return
      }

      const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP']
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
    const { chapterId } = await analysisImagesShareValidator.validate(request.all())
    const chapter = await prisma.chapter.findUnique({
      where: { chapterId },
    })
    if (!chapter) {
      return response
        .status(404)
        .json(new SResponse({ code: 1, message: '章节未找到', status: 'chapter not found' }))
    }
    let images: string[] = []
    try {
      images = image_files(chapter.chapterPath)
    } catch {
      images = []
    }
    const listResponse = new ListResponse({
      code: 0,
      message: '章节信息获取成功',
      list: images,
      count: images.length,
    })
    return response.json(listResponse)
  }

  async analysis_mangas({ request, response }: HttpContext) {
    const { mediaId } = await analysisMangasShareValidator.validate(request.all())

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

    mangas.forEach((manga: any) => {
      const dirOutExt = manga.mangaPath.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
      const dirMeta = dirOutExt + '-smanga-info'
      const dirMetaNew = dirOutExt + '/.smanga'

      const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP']
      extensions.some((ext) => {
        const picPath = dirOutExt + ext
        if (fs.existsSync(picPath)) {
          manga.outCovers = [picPath]
          return true
        }
      })

      // 有元数据文件
      if (fs.existsSync(dirMeta)) {
        const metaFiles = fs.readdirSync(dirMeta, 'utf-8')
        manga.metaFiles = metaFiles.map((file) => path.join(dirMeta, file))
      }
      if (fs.existsSync(dirMetaNew)) {
        const metaFiles = fs.readdirSync(dirMetaNew, 'utf-8')
        manga.metaFiles = metaFiles.map((file) => path.join(dirMetaNew, file))
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
