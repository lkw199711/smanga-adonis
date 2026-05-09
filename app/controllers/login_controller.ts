import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '../interfaces/response.js'
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
      response
        .status(403)
        .json(new SResponse({ code: 403, message: '无权限', status: 'no permission' }))
      return false
    }
    return true
  }

  public async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const list = await prisma.login.findMany()
    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: list.length,
    })
    return response.json(listResponse)
  }

  public async show({ request, params, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { loginId } = await idParamLoginValidator.validate(params)
    const login = await prisma.login.findUnique({ where: { loginId } })
    const showResponse = new SResponse({ code: 0, message: '', data: login })
    return response.json(showResponse)
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
      return response.status(401).json(new SResponse({ code: 1, message: '用户不存在', data: login }))
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
      return response.status(401).json(new SResponse({ code: 1, message: '密码错误', data: login }))
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
    const saveResponse = new SResponse({
      code: 0,
      message: '登录成功',
      data: {
        ...login,
        serverKey: get_config()?.serverKey,
        userRole: user.role,
      },
    })
    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { loginId } = await idParamLoginValidator.validate(params)
    const modifyData = await updateLoginValidator.validate(request.all())
    const login = await prisma.login.update({
      where: { loginId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: login })
    return response.json(updateResponse)
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { loginId } = await idParamLoginValidator.validate(params)
    const login = await prisma.login.delete({ where: { loginId } })
    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: login })
    return response.json(destroyResponse)
  }
}
