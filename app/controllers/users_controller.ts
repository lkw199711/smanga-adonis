import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import md5 from '../utils/md5.js'
import { sql_parse_json } from '#utils/index'
import {
  listUserValidator,
  idParamUserValidator,
  createUserValidator,
  updateUserValidator,
} from '#validators/user'

export default class UsersController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  public async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { page, pageSize } = await listUserValidator.validate(request.qs())

    const queryParams = {
      ...(page && pageSize && { skip: (page - 1) * pageSize, take: pageSize }),
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

    return response.json({
      code: 200,
      message: '',
      list: list.map((item: any) => {
        item.mediaPermissons = item.mediaPermissons.map((item: any) => item.mediaId)
        return item
      }),
      count,
    })
  }

  public async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { userId } = await idParamUserValidator.validate(params)
    const user = await prisma.user.findUnique({ where: { userId } })
    return response.json({ code: 200, message: '', data: user })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { userName, passWord, mediaLimit, role, mediaPermit } = await createUserValidator.validate(
      request.all()
    )

    const user = await prisma.user.create({
      data: { userName, passWord: md5(passWord), role, mediaPermit },
    })

    // 新增失败报错
    if (!user) {
      return response.status(500).json({ code: 500, message: '新增失败' })
    }

    // 新增用户权限
    if (mediaLimit) {
      for (const item of mediaLimit) {
        if (item?.permit) {
          await prisma.mediaPermisson.create({
            data: { userId: user.userId, mediaId: item.mediaId },
          })
        }
      }
    }

    return response.json({ code: 200, message: '新增成功', data: user })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { userId } = await idParamUserValidator.validate(params)
    const { userName, passWord, userConfig, mediaLimit, role, mediaPermit } =
      await updateUserValidator.validate(request.all())
    const user = await prisma.user.update({
      where: { userId },
      data: {
        userName,
        ...(passWord && { passWord: md5(passWord) }),
        userConfig: sql_parse_json(userConfig) as any,
        role,
        mediaPermit,
      },
    })

    // 更新失败报错
    if (!user) {
      return response.status(500).json({ code: 500, message: '更新失败' })
    }

    // 更新用户权限
    if (mediaLimit) {
      for (const item of mediaLimit) {
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
      }
    }

    return response.json({ code: 200, message: '更新成功', data: user })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { userId } = await idParamUserValidator.validate(params)

    try {
      // 使用事务确保所有删除操作要么全部成功，要么全部失败
      const user = await prisma.$transaction(async (prisma) => {
        // 先删除与用户关联的所有记录
        await prisma.login.deleteMany({ where: { userId } })
        await prisma.token.deleteMany({ where: { userId } })
        await prisma.userPermisson.deleteMany({ where: { userId } })
        await prisma.mediaPermisson.deleteMany({ where: { userId } })
        await prisma.history.deleteMany({ where: { userId } })
        await prisma.collect.deleteMany({ where: { userId } })
        await prisma.share.deleteMany({ where: { userId } })

        // 最后删除用户本身
        return await prisma.user.delete({ where: { userId } })
      })

      return response.json({ code: 200, message: '删除成功', data: user })
    } catch (error) {
      console.error('删除用户失败:', error)
      return response.status(500).json({ code: 500, message: '删除用户失败，请检查用户是否存在或有其他关联记录' })
    }
  }

  public async config({ request, response }: HttpContext) {
    const { userId } = request as any
    const user = await prisma.user.findFirst({ where: { userId } })

    if (!user) {
      return response.status(404).json({ code: 404, message: '获取用户信息错误' })
    }

    const config = sql_parse_json(user?.userConfig || {})
    return response.json({ code: 200, message: '', data: config })
  }
}
