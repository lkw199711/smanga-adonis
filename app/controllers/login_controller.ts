import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import md5 from '../utils/md5.js'
import { get_config } from '#utils/index'
import { v4 as uuidv4 } from 'uuid'
import {
  idParamLoginValidator,
  createLoginValidator,
  updateLoginValidator,
} from '#validators/login'

export default class LoginController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || user.role !== 'admin') {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  public async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const list = await prisma.login.findMany()
    return response.json({ code: 200, message: '', list, count: list.length })
  }

  public async show({ request, params, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { loginId } = await idParamLoginValidator.validate(params)
    const login = await prisma.login.findUnique({ where: { loginId } })
    return response.json({ code: 200, message: '', data: login })
  }

  public async create({ request, response }: HttpContext) {
    const { userName, passWord } = await createLoginValidator.validate(request.all())
    const user = await prisma.user.findUnique({
      where: { userName },
      include: {
        userPermissons: true,
      },
    })

    let login = null
    if (!user) {
      login = await prisma.login.create({
        data: {
          userName,
          request: 0,
          ip: request.ip(),
          userAgent: request.header('user-agent'),
        },
      })
      return response.status(401).json({ code: 401, message: '用户不存在', data: login })
    }
    if (user.passWord !== md5(passWord)) {
      login = await prisma.login.create({
        data: {
          user: { connect: { userId: user.userId } },
          userName,
          request: 0,
          ip: request.ip(),
          userAgent: request.header('user-agent'),
        },
      })
      return response.status(401).json({ code: 401, message: '密码错误', data: login })
    }

    // 生成token
    const token = await prisma.token.create({
      data: {
        token: uuidv4(),
        user: { connect: { userId: user.userId } },
      },
    })

    // 生成登录记录
    login = await prisma.login.create({
      data: {
        user: { connect: { userId: user.userId } },
        userName,
        token: token.token,
        request: 1,
        ip: request.ip(),
        userAgent: request.header('user-agent'),
      },
    })
    return response.json({
      code: 200,
      message: '登录成功',
      data: { ...login, serverKey: get_config()?.serverKey, userRole: user.role },
    })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { loginId } = await idParamLoginValidator.validate(params)
    const modifyData = await updateLoginValidator.validate(request.all())
    const login = await prisma.login.update({
      where: { loginId },
      data: modifyData,
    })
    return response.json({ code: 200, message: '更新成功', data: login })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { loginId } = await idParamLoginValidator.validate(params)
    const login = await prisma.login.delete({ where: { loginId } })
    return response.json({ code: 200, message: '删除成功', data: login })
  }
}
