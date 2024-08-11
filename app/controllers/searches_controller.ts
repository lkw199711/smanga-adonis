/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-08 21:29:33
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-10 01:20:31
 * @FilePath: \smanga-adonis\app\controllers\searches_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse } from '../interfaces/response.js'
import { order_params } from '../utils/index.js'

export default class SearchesController {
  public async mangas({ request, response }: HttpContext) {
    const { searchText, page, pageSize, order } = request.only([
      'searchText',
      'searchType',
      'page',
      'pageSize',
      'order',
    ])
    const quertParams = {
      where: {
        subTitle: {
          contains: searchText,
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: order_params(order, 'manga'),
    }

    const [list, count] = await Promise.all([
      prisma.manga.findMany(quertParams),
      prisma.manga.count({ where: quertParams.where }),
    ])

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })
    return response.json(listResponse)
  }

  public async chapters({ request, response }: HttpContext) {
    const { searchText, page, pageSize, order } = request.only([
      'searchText',
      'page',
      'pageSize',
      'order',
    ])

    const quertParams = {
      where: {
        subTitle: {
          contains: searchText,
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: order_params(order, 'chapter'),
    }

    const [list, count] = await Promise.all([
      prisma.chapter.findMany(quertParams),
      prisma.chapter.count({ where: quertParams.where }),
    ])

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count,
    })
      
    return response.json(listResponse)
  }
}
