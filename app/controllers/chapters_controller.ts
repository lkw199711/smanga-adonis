/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-06 01:14:19
 * @FilePath: \smanga-adonis\app\controllers\chapters_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.interface.js'
import { Prisma } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
// @ts-ignore
import { unzipFile } from '../utils/unzip.cjs'
import { path_compress, order_params } from '../utils/index.js'
export default class ChaptersController {
  public async index({ request, response }: HttpContext) {
    const { mangaId, page, pageSize, order } = request.only([
      'page',
      'pageSize',
      'mangaId',
      'order',
    ])

    let listResponse = null
    if (page) {
      listResponse = await this.paginate({ mangaId, page, pageSize, order })
    } else {
      listResponse = await this.no_paginate({ mangaId, order })
    }

    return response.json(listResponse)
  }

  // 不分页
  private async no_paginate({ mangaId, order }: any) {
    const queryParams = {
      where: {
        ...(mangaId && {
          mangaId: mangaId,
        }),
      },
      orderBy: { ...(order && order_params(order)) },
    }

    const list = await prisma.chapter.findMany(queryParams)

    return new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
  }

  // 分页
  private async paginate({ mangaId, page, pageSize, order }: any) {
    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      where: {
        ...(mangaId && {
          mangaId: mangaId,
        }),
      },
      orderBy: { ...(order && order_params(order)) },
    }

    const [list, count] = await Promise.all([
      prisma.chapter.findMany(queryParams),
      prisma.chapter.count({ where: queryParams.where }),
    ])

    return new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })
  }

  public async show({ params, response }: HttpContext) {
    let { chapterId } = params
    const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
    const showResponse = new SResponse({ code: 0, message: '', data: chapter })
    return response.json(showResponse)
  }

  public async first({ params, request, response }: HttpContext) {
    let { mangaId, order } = request.only(['mangaId', 'order'])
    const chapter = await prisma.chapter.findFirst({
      where: { mangaId },
      orderBy: order_params(order),
    })

    const showResponse = new SResponse({ code: 0, message: '', data: chapter })
    return response.json(showResponse)
  }

  public async images({ params, response }: HttpContext) {
    let { chapterId } = params
    const chapter = await prisma.chapter.findUnique({ where: { chapterId } })
    if (!chapter) {
      return response.json(
        new SResponse({ code: 1, message: '章节不存在', data: [], status: 'compressed' })
      )
    }

    let images: string[] = []
    let compress: any = null

    //  纯图片章节
    if (chapter.chapterType === 'img') {
      images = image_files(chapter.chapterPath)
      const imagesResponse = new SResponse({
        code: 0,
        message: '',
        data: images,
        status: 'compressed',
      })
      return response.json(imagesResponse)
    }

    // 已完成解压缩的章节
    compress = await prisma.compress.findUnique({ where: { chapterId: chapterId } })
    if (compress) {
      images = image_files(compress.compressPath)
      const imagesResponse = new SResponse({
        code: 0,
        message: '',
        data: images,
        status: 'compressed',
      })
      return response.json(imagesResponse)
    }

    const compressPath = path.join(path_compress(), `smanga_chapter_${chapter.chapterId}`)

    // 创建解压缩任务

    compress = await prisma.compress.create({
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

    // 执行解压缩任务
    await unzipFile(chapter.chapterPath, compressPath)

    // 更新解压缩任务状态
    compress = await prisma.compress.update({
      where: {
        chapterId: chapter.chapterId,
      },
      data: {
        compressStatus: 'compressed',
      },
    })

    images = image_files(compress.compressPath)
    const imagesResponse = new SResponse({
      code: 0,
      message: '',
      data: images,
      status: 'compressed',
    })
    return response.json(imagesResponse)
  }

  public async create({ request, response }: HttpContext) {
    const insertData = request.body() as Prisma.chapterCreateInput
    const chapter = await prisma.chapter.create({
      data: insertData,
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: chapter })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { chapterId } = params
    const modifyData = request.body()
    const chapter = await prisma.chapter.update({
      where: { chapterId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: chapter })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { chapterId } = params
    const chapter = await prisma.chapter.delete({ where: { chapterId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: chapter })
    return response.json(destroyResponse)
  }
}

// 定义支持的图片文件扩展名
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp']

function image_files(dirPath: string): string[] {
  let imagePaths: string[] = []

  // 读取目录下的所有文件和子目录
  const files: string[] = fs.readdirSync(dirPath)

  files.forEach((file: string) => {
    const filePath: string = path.join(dirPath, file)
    const stat: fs.Stats = fs.statSync(filePath)

    if (stat.isDirectory()) {
      // 如果是目录, 递归处理
      imagePaths = imagePaths.concat(image_files(filePath))
    } else if (imageExtensions.includes(path.extname(file).toLowerCase())) {
      // 如果是图片文件, 添加绝对路径到数组
      imagePaths.push(filePath)
    }
  })

  return imagePaths
}
