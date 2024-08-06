/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-06 00:20:22
 * @FilePath: \smanga-adonis\app\controllers\compresses_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'

export default class CompressesController {
  public async index({ request, response }: HttpContext) {
    const { page, pageSize } = request.only(['page', 'pageSize'])
    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    }
    const [list, count] = await Promise.all([
      prisma.compress.findMany(queryParams),
      prisma.compress.count(),
    ])

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })
    return response.json(listResponse)
  }

  public async create({ request, response }: HttpContext) {
    const {
      compressType,
      compressPath,
      compressStatus,
      imageCount,
      mediaId,
      mangaId,
      chapterId,
      chapterPath,
    } = request.body()

    const compress = await prisma.compress.create({
      data: {
        compressType,
        compressPath,
        compressStatus,
        imageCount,
        mediaId,
        mangaId,
        chapterId,
        chapterPath,
      },
    })
    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: compress })
    return response.json(saveResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { compressId } = params
    compressId = Number(compressId)
    const compress = await prisma.compress.findUnique({ where: { compressId } })
    const showResponse = new SResponse({ code: 0, message: '', data: compress })
    return response.json(showResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { compressId } = params
    compressId = Number(compressId)
    const {
      compressType,
      compressPath,
      compressStatus,
      imageCount,
      mediaId,
      mangaId,
      chapterId,
      chapterPath,
    } = request.body()
    const compress = await prisma.compress.update({
      where: { compressId },
      data: {
        compressType,
        compressPath,
        compressStatus,
        imageCount,
        mediaId,
        mangaId,
        chapterId,
        chapterPath,
      },
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: compress })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { compressId } = params
    compressId = Number(compressId)
    const compress = await prisma.compress.delete({ where: { compressId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: compress })
    return response.json(destroyResponse)
  }
}
