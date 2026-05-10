import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import * as fs from 'fs'
import * as path from 'path'
import { path_compress, order_params, extract_numbers, get_config, s_delete } from '#utils/index'
import { TaskPriority } from '#type/index'
import { addTask } from '#services/queue_service'
import { unzipFile } from '#utils/unzip'
import {
  listChapterValidator,
  idParamChapterValidator,
  firstChapterValidator,
  imagesChapterValidator,
  createChapterValidator,
  updateChapterValidator,
  batchIdsParamChapterValidator,
  downloadChapterValidator,
} from '#validators/chapter'

export default class ChaptersController {
  public async index({ request, response }: HttpContext) {
    let { mangaId, mediaId, page, pageSize, order, keyWord } = await listChapterValidator.validate(
      request.qs()
    )

    const userId = (request as any).userId
    if (mangaId) {
      const manga = await prisma.manga.findUnique({ where: { mangaId } })
      if (!manga) {
        return response
          .status(404)
          .json({ code: 404, message: '漫画不存在', status: 'manga not exist' })
      }
      mediaId = manga.mediaId
    }

    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return response
        .status(401)
        .json({ code: 401, message: '用户不存在', status: 'token error' })
    }
    const isAdmin = user.role === 'admin' || user.mediaPermit === 'all'
    const mediaPermissons = await prisma.mediaPermisson.findMany({
      where: { userId },
      select: { mediaId: true },
    })

    if (!isAdmin) {
      const mediaIds = mediaPermissons.map((item: any) => item.mediaId)
      if (mediaId !== undefined && !mediaIds.includes(mediaId)) {
        return response
          .status(403)
          .json({ code: 403, message: '没有权限访问', status: 'no permission' })
      }
    }

    let listResponse = null
    if (page) {
      listResponse = await this.paginate({
        mangaId,
        mediaId,
        page,
        pageSize,
        keyWord,
        order,
        userId,
      })
    } else {
      listResponse = await this.no_paginate({ mangaId, mediaId, order, userId })
    }

    return response.json(listResponse)
  }

  // 校验用户是否有权访问指定 mediaId 的媒体库
  private async checkMediaPermission(userId: number, mediaId: number): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) return false
    if (user.role === 'admin' || user.mediaPermit === 'all') return true
    const perm = await prisma.mediaPermisson.findFirst({ where: { userId, mediaId } })
    return !!perm
  }

  // 不分页
  private async no_paginate({ mangaId, mediaId, order, userId }: any) {
    const queryParams = {
      where: {
        ...(mangaId && { mangaId }),
        ...(mediaId && { mediaId }),
        deleteFlag: 0,
      },
      include: {
        latests: {
          where: { userId },
        },
      },
      orderBy: {
        ...(order && order_params(order)),
      },
    }

    const list = await prisma.chapter.findMany(queryParams)

    list.forEach((chapter: any) => {
      chapter.latest = chapter.latests?.length ? chapter.latests[0] : null
    })

    return {
      code: 200,
      message: '',
      list,
      count: list.length,
    }
  }

  // 分页
  private async paginate({ mangaId, mediaId, page, pageSize, keyWord, order, userId }: any) {
    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      where: {
        ...(mangaId && { mangaId }),
        ...(mediaId && { mediaId }),
        ...(keyWord && { subTitle: { contains: keyWord } }),
        deleteFlag: 0,
      },
      include: {
        latests: {
          where: { userId },
        },
        manga: {
          select: {
            browseType: true,
            removeFirst: true,
            direction: true,
          },
        },
      },
      orderBy: { ...(order && order_params(order)) },
    }

    const [rawList, count] = await Promise.all([
      prisma.chapter.findMany(queryParams),
      prisma.chapter.count({ where: queryParams.where }),
    ])

    const list = rawList.map((chapter: any) => {
      chapter.latest = chapter.latests?.length ? chapter.latests[0] : null
      return {
        ...chapter,
        ...chapter.manga,
      }
    })

    return {
      code: 200,
      message: '',
      list,
      count,
    }
  }

  public async show({ params, request, response }: HttpContext) {
    const { chapterId } = await idParamChapterValidator.validate(params)
    const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
    if (!chapter) {
      return response.status(404).json({ code: 404, message: '章节不存在' })
    }

    const userId = (request as any).userId
    if (!(await this.checkMediaPermission(userId, chapter.mediaId))) {
      return response
        .status(403)
        .json({ code: 403, message: '没有权限访问', status: 'no permission' })
    }

    return response.json({ code: 200, message: '', data: chapter })
  }

  public async first({ request, response }: HttpContext) {
    const { mangaId, order } = await firstChapterValidator.validate(request.qs())

    const userId = (request as any).userId
    const manga = await prisma.manga.findUnique({ where: { mangaId } })
    if (!manga) {
      return response.status(404).json({ code: 404, message: '漫画不存在' })
    }
    if (!(await this.checkMediaPermission(userId, manga.mediaId))) {
      return response
        .status(403)
        .json({ code: 403, message: '没有权限访问', status: 'no permission' })
    }

    const chapter = await prisma.chapter.findFirst({
      where: { mangaId },
      orderBy: order_params(order),
    })

    return response.json({ code: 200, message: '', data: chapter })
  }

  public async images({ params, request, response }: HttpContext) {
    const { chapterId } = await idParamChapterValidator.validate(params)
    const { orderChapterByNumber, reTry } = await imagesChapterValidator.validate(request.all())
    const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
    if (!chapter) {
      return response.status(404).json({ code: 404, message: '章节不存在', data: [], status: 'compressed' })
    }

    const userId = (request as any).userId
    if (!(await this.checkMediaPermission(userId, chapter.mediaId))) {
      return response
        .status(403)
        .json({ code: 403, message: '没有权限访问', status: 'no permission' })
    }

    if (!fs.existsSync(chapter.chapterPath)) {
      return response
        .status(404)
        .json({ code: 404, message: '章节文件不存在', data: [], status: 'compressed' })
    }

    let images: string[] = []
    let imagesResponse: any
    // 查询解压记录
    let compress: any = await prisma.compress.findUnique({ where: { chapterId } })
    const pathInfo = await prisma.path.findUnique({ where: { pathId: chapter.pathId } })
    const exclude = pathInfo?.exclude

    const compressPathExists = compress && fs.existsSync(compress.compressPath)
    if (chapter.chapterType === 'img') {
      // 纯图片章节
      images = image_files(chapter.chapterPath, exclude)
      imagesResponse = {
        code: 200,
        message: '',
        data: images,
        status: 'compressed',
      }
    } else if (chapter.chapterType === 'pdf') {
      // PDF章节，直接返回PDF文件路径
      images = [chapter.chapterPath]
      imagesResponse = {
        code: 200,
        message: '',
        data: images,
        status: 'compressed',
      }
    } else if (!compress && get_config().compress.sync) {
      // 同步解压缩
      const compressPath = path.join(path_compress(), `smanga_chapter_${chapter.chapterId}`)
      compress = await prisma.compress
        .create({
          data: {
            chapter: {
              connect: {
                chapterId: chapter.chapterId,
              },
            },
            chapterPath: chapter.chapterPath,
            manga: {
              connect: {
                mangaId: chapter.mangaId,
              },
            },
            mediaId: chapter.mediaId,
            compressType: chapter.chapterType,
            compressPath,
            compressStatus: 'compressing',
          },
        })
        .catch((_error: any) => {
          imagesResponse = {
            code: 202,
            message: '',
            data: images,
            status: 'compressing',
          }

          return response.json(imagesResponse)
        })
      await unzipFile(chapter.chapterPath, compressPath)
      // 解压完成后更新状态
      await prisma.compress.update({
        where: { chapterId: chapter.chapterId },
        data: { compressStatus: 'compressed' },
      })
      images = image_files(compressPath, exclude)
      imagesResponse = {
        code: 200,
        message: '',
        data: images,
        status: 'compressed',
      }

      // 清理解压缓存
      if (get_config().compress.autoClear === 1) {
        await addTask({
          taskName: `clear_compress_cache_${chapter.chapterId}`,
          command: 'clearCompressCache',
          args: {},
          priority: TaskPriority.clearCompress,
        })
      }
    } else if (!compress) {
      // 创建解压缩任务
      const compressPath = path.join(path_compress(), `smanga_chapter_${chapter.chapterId}`)
      compress = await prisma.compress
        .create({
          data: {
            chapter: {
              connect: {
                chapterId: chapter.chapterId,
              },
            },
            chapterPath: chapter.chapterPath,
            manga: {
              connect: {
                mangaId: chapter.mangaId,
              },
            },
            mediaId: chapter.mediaId,
            compressType: chapter.chapterType,
            compressPath,
            compressStatus: 'compressing',
          },
        })
        .catch((_error: any) => {
          imagesResponse = {
            code: 202,
            message: '',
            data: images,
            status: 'compressing',
          }

          return response.json(imagesResponse)
        })

      // 执行解压缩任务
      await addTask({
        taskName: `compress_chapter_${chapter.chapterId}`,
        command: 'compressChapter',
        args: {
          chapterType: chapter.chapterType,
          chapterPath: chapter.chapterPath,
          chapterInfo: chapter,
          compressPath,
          chapterId: chapter.chapterId,
        },
        priority: TaskPriority.compress,
        timeout: 1000 * 60 * 10,
      })

      imagesResponse = {
        code: 202,
        message: '',
        data: images,
        status: 'compressing',
      }
    } else if (!compressPathExists && reTry !== undefined && reTry < 10) {
      // 等待解压任务
      imagesResponse = { code: 202, message: '', data: [], status: 'compressing' }
    } else if (compressPathExists) {
      // 已完成解压缩的章节
      images = image_files(compress.compressPath, exclude)
      imagesResponse = {
        code: 200,
        message: '',
        data: images,
        status: compress.compressStatus,
      }

      // 清理解压缓存
      if (get_config().compress.autoClear === 1) {
        await addTask({
          taskName: `clear_compress_cache_${chapter.chapterId}`,
          command: 'clearCompressCache',
          args: {},
          priority: TaskPriority.clearCompress,
        })
      }
    } else {
      // 解压任务超时，删除任务记录
      await prisma.compress.delete({ where: { chapterId } })
      imagesResponse = {
        code: 500,
        message: '章节解压超时',
        data: [],
        status: 'failed',
      }
    }

    // 将返回的图片按数字排序
    if (images.length > 0) {
      if (orderChapterByNumber) {
        images.sort((a, b) => extract_numbers(a) - extract_numbers(b))
      } else {
        images.sort()
      }
      imagesResponse!.data = images
    }

    return response.json(imagesResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = await createChapterValidator.validate(request.all())
    const chapter = await prisma.chapter.create({
      data: insertData as any,
    })
    return response.json({ code: 200, message: '新增成功', data: chapter })
  }

  public async update({ params, request, response }: HttpContext) {
    const { chapterId } = await idParamChapterValidator.validate(params)
    const modifyData = await updateChapterValidator.validate(request.all())
    const chapter = await prisma.chapter.update({
      where: { chapterId },
      data: modifyData,
    })
    return response.json({ code: 200, message: '更新成功', data: chapter })
  }

  public async destroy({ params, response }: HttpContext) {
    const { chapterId } = await idParamChapterValidator.validate(params)
    const chapter = await prisma.chapter.update({ where: { chapterId }, data: { deleteFlag: 1 } })

    await addTask({
      taskName: `delete_chapter_${chapter.chapterId}`,
      command: 'deleteChapter',
      args: { chapterId: chapter.chapterId },
      priority: TaskPriority.deleteManga,
    })

    return response.json({ code: 200, message: '删除成功', data: chapter })
  }

  public async destroy_batch({ params, response }: HttpContext) {
    const { chapterIds } = await batchIdsParamChapterValidator.validate(params)
    const chapters = await prisma.chapter.updateMany({
      where: {
        chapterId: { in: chapterIds },
      },
      data: { deleteFlag: 1 },
    })

    const chapterIdList = chapterIds as number[]
    for (const id of chapterIdList) {
      await addTask({
        taskName: `delete_chapter_${id}`,
        command: 'deleteChapter',
        args: { chapterId: id },
        priority: TaskPriority.deleteManga,
      })
    }

    return response.json({ code: 200, message: '删除成功', data: chapters })
  }

  public async download({ request, response }: HttpContext) {
    const { chapterId } = await downloadChapterValidator.validate(request.all())
    const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
    if (!chapter) {
      return response.status(404).json({ code: 404, message: '章节不存在' })
    }

    const userId = (request as any).userId
    if (!(await this.checkMediaPermission(userId, chapter.mediaId))) {
      return response
        .status(403)
        .json({ code: 403, message: '没有权限访问', status: 'no permission' })
    }

    if (!fs.existsSync(chapter.chapterPath)) {
      return response.status(404).json({ code: 404, message: '章节文件不存在' })
    }

    if (chapter.chapterType === 'img') {
      const images = image_files(chapter.chapterPath, '')
      const imagesResponse = {
        code: 200,
        message: '',
        data: images,
        status: 'compressed',
      }
      return response.json(imagesResponse)
    } else {
      const fileName = path.basename(chapter.chapterPath)
      response.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(fileName)}"`
      )

      response.header('Content-Type', 'application/octet-stream')

      response.stream(fs.createReadStream(chapter.chapterPath))

      return response
    }
  }

  public async compress_delete({ params, request, response }: HttpContext) {
    const { chapterId } = await idParamChapterValidator.validate(params)

    const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
    if (chapter) {
      const userId = (request as any).userId
      if (!(await this.checkMediaPermission(userId, chapter.mediaId))) {
        return response
          .status(403)
          .json({ code: 403, message: '没有权限访问', status: 'no permission' })
      }
    }

    const compress = await prisma.compress.findUnique({ where: { chapterId } })
    if (!compress) {
      return response.status(404).json({ code: 404, message: '章节解压记录不存在' })
    }
    try {
      s_delete(compress.compressPath)
    } catch (_error) {
      // 目录可能已不存在，忽略删除错误
    }
    await prisma.compress.delete({ where: { compressId: compress.compressId } })
    return response.json({ code: 200, message: '删除成功' })
  }
}

// 定义支持的图片文件扩展名
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp']

function image_files(dirPath: string, exclude: string | null | undefined = ''): string[] {
  let imagePaths: string[] = []

  // 读取目录下的所有文件和子目录
  let files: string[]
  try {
    files = fs.readdirSync(dirPath)
  } catch (_error) {
    return imagePaths
  }

  files.forEach((file: string) => {
    const filePath: string = path.join(dirPath, file)
    try {
      const stat: fs.Stats = fs.statSync(filePath)
      if (stat.isDirectory()) {
        // 如果是目录, 递归处理
        imagePaths = imagePaths.concat(image_files(filePath, exclude))
      } else if (imageExtensions.includes(path.extname(file).toLowerCase())) {
        // 如果是图片文件, 添加绝对路径到数组
        imagePaths.push(filePath)
      }
    } catch (_error) {
      // 跳过无法访问的文件
    }
  })

  // 如果有排除规则，则过滤掉不符合规则的图片
  if (exclude) {
    try {
      const excludeRegex = new RegExp(exclude)
      imagePaths = imagePaths.filter((image: string) => !excludeRegex.test(image))
    } catch (_error) {
      // 正则表达式无效，跳过过滤
    }
  }

  return imagePaths
}
