import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
import md5 from '../utils/md5.js'
import { sql_parse_json } from '#utils/index'

export default class UsersController {
  public async index({ request, response }: HttpContext) {
    const { page, pageSize } = request.only(['page', 'pageSize', 'order'])

    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      where: {},
      include: {
        mediaPermissons: {
          select: {
            mediaId: true,
            userId: true,
          },
        },
      },
    }

    const [list, count] = await Promise.all([
      prisma.user.findMany(queryParams),
      prisma.user.count({ where: queryParams.where }),
    ])

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list: list.map((item: any) => {
        item.mediaPermissons = item.mediaPermissons.map((item: any) => item.mediaId)
        return item
      }),
      count,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { userId } = params
    userId = Number(userId)
    const user = await prisma.user.findUnique({ where: { userId } })
    const showResponse = new SResponse({ code: 0, message: '', data: user })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    const { userName, passWord, mediaLimit, role, mediaPermit } = request.only([
      'userName',
      'passWord',
      'role',
      'mediaPermit',
      'mediaLimit',
    ])

    if (!userName) {
      return response.json(new SResponse({ code: 1, message: '用户名不能为空' }))
    }

    const user = await prisma.user.create({
      data: { userName, passWord: md5(passWord), role, mediaPermit },
    })

    // 新增失败报错
    if (!user) {
      return response.json(new SResponse({ code: 1, message: '新增失败' }))
    }

    // 新增用户权限
    mediaLimit?.forEach(async (item: any) => {
      if (item?.permit) {
        await prisma.mediaPermisson.create({
          data: { userId: user.userId, mediaId: item.mediaId },
        })
      }
    })

    const saveResponse = new SResponse({ code: 0, message: '新增成功', data: user })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { userId } = params
    const { userName, passWord, userConfig, mediaLimit, role, mediaPermit } = request.only([
      'userName',
      'passWord',
      'userConfig',
      'mediaLimit',
      'role',
      'mediaPermit',
    ])
    const user = await prisma.user.update({
      where: { userId },
      data: {
        userName,
        ...(passWord && { passWord: md5(passWord) }),
        userConfig: sql_parse_json(userConfig),
        role,
        mediaPermit,
      },
    })

    // 更新失败报错
    if (!user) {
      return response.json(new SResponse({ code: 1, message: '更新失败' }))
    }

    // 更新用户权限
    if (mediaLimit) {
      mediaLimit.forEach(async (item: any) => {
        const permisson = await prisma.mediaPermisson.findFirst({
          where: { userId, mediaId: item.mediaId },
        })

        // 如果权限配置为true，则插入数据
        if (item.permit && !permisson) {
          await prisma.mediaPermisson.create({
            data: { userId, mediaId: item.mediaId },
          })
        }
        // 如果权限配置为false，则删除数据
        if (!item.permit && permisson) {
          await prisma.mediaPermisson.delete({
            where: { mediaPermissonId: permisson.mediaPermissonId },
          })
        }
      })
    }


    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: user })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { userId } = params
    const user = await prisma.user.delete({ where: { userId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: user })
    return response.json(destroyResponse)
  }

  public async config({ request, response }: HttpContext) {
    // const { userConfig } = request.only(['userId', 'userConfig'])
    const { userId } = request as any
    const user = await prisma.user.findFirst({ where: { userId } })

    if (!user) {
      return response.json(new SResponse({ code: 1, message: '获取用户信息错误' }))
    }

    const config = sql_parse_json(user?.userConfig || {})
    return response.json(new SResponse({ code: 0, message: '', data: config }))
  }
}
