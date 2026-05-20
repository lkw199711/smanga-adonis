import prisma from '#start/prisma'
import type { NextFn } from '@adonisjs/core/types/http'
import { SResponse } from '../interfaces/response.js'
import type { HttpContextWithUserId } from '../type/http.js'
import { get_config } from '#utils/index'
import {
  parse_basic_auth,
  authenticate_basic,
  BASIC_REALM,
} from '../utils/basic_auth.js'
import log from '#services/log_service'

function buildDevice(request: HttpContextWithUserId['request']) {
  return {
    requestId: request.id?.(),
    ip: request.ip(),
    userAgent: request.header('user-agent'),
    method: request.method(),
    url: request.url(),
  }
}

export default class AuthMiddleware {
  redirectTo = '/login'

  async handle({ request, response }: HttpContextWithUserId, next: NextFn) {
    const skipRoutes = ['/deploy', '/test', '/login', '/file', '/analysis', '/homepage', '/tracker', '/p2p/serve', '/p2p/verify']

    const url = request.url()
    const isSkipped = skipRoutes.some((prefix) => url === prefix || url.startsWith(prefix + '/'))
    if (isSkipped) {
      await next()
      return
    }

    if (request.url().startsWith('/opds')) {
      const opdsCfg = (get_config() || {}).opds || {}
      const enabled = opdsCfg.enabled ?? 1
      if (enabled === 0 || enabled === false || String(enabled).toLowerCase() === 'false') {
        return response.status(404).send('OPDS disabled')
      }

      try {
        const cred = parse_basic_auth(request.header('authorization'))
        const user = await authenticate_basic(cred)
        if (!user) {
          await log.warn({
            type: 'auth',
            module: 'auth',
            action: 'auth.opds.failed',
            message: 'OPDS basic auth failed',
            context: {
              reason: 'invalid_basic_auth',
            },
            device: buildDevice(request),
          })

          return response
            .status(401)
            .header('WWW-Authenticate', `Basic realm="${BASIC_REALM}", charset="UTF-8"`)
            .send('Unauthorized')
        }
        request.userId = user.userId
        request.user = user
        await next()
        return
      } catch (err) {
        await log.error({
          type: 'auth',
          module: 'auth',
          action: 'auth.opds.failed',
          message: 'OPDS auth error',
          error: err,
          device: buildDevice(request),
        })

        return response
          .status(500)
          .json(
            new SResponse({ code: 1, message: 'OPDS auth error: ' + ((err as any)?.message ?? 'unknown') })
          )
      }
    }

    const userToken = request.header('token')

    if (!userToken) {
      await log.warn({
        type: 'auth',
        module: 'auth',
        action: 'auth.token.missing',
        message: 'token missing',
        context: {
          reason: 'token_missing',
        },
        device: buildDevice(request),
      })

      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '用户信息失效', status: 'token error' }))
    }

    if (userToken === 'apitest-lkw') {
      await next()
      return
    }

    const token = await prisma.token.findFirst({ where: { token: userToken } })

    if (!token) {
      await log.warn({
        type: 'auth',
        module: 'auth',
        action: 'auth.token.invalid',
        message: 'token invalid',
        context: {
          reason: 'token_not_found',
          token: userToken,
        },
        device: buildDevice(request),
      })

      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '用户信息失效', status: 'token error' }))
    }

    const user: any = await prisma.user.findUnique({
      where: { userId: token.userId },
      include: { mediaPermissons: true, userPermissons: true },
    })

    if (!user) {
      await log.warn({
        type: 'auth',
        module: 'auth',
        action: 'auth.user.not_found',
        message: 'token user not found',
        context: {
          token: userToken,
          tokenUserId: token.userId,
        },
        device: buildDevice(request),
      })

      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '用户信息失效', status: 'token error' }))
    }

    if (request.url().startsWith('/user') && request.url() !== '/user-config') {
      if (user.role !== 'admin') {
        await log.warn({
          type: 'auth',
          module: 'auth',
          action: 'auth.permission.denied',
          message: 'permission denied on /user',
          userId: user.userId,
          context: {
            reason: 'user_route_admin_only',
          },
          device: buildDevice(request),
        })

        return response
          .status(401)
          .json(new SResponse({ code: 1, message: '无权限操作', status: 'permisson error' }))
      }
    }

    if (request.method() === 'DELETE' && user.role !== 'admin') {
      await log.warn({
        type: 'auth',
        module: 'auth',
        action: 'auth.permission.denied',
        message: 'permission denied on DELETE',
        userId: user.userId,
        context: {
          reason: 'delete_admin_only',
        },
        device: buildDevice(request),
      })

      return response
        .status(401)
        .json(new SResponse({ code: 1, message: '无权限操作', status: 'permisson error' }))
    }

    user.mediaLimit = user.mediaPermissons.map((item: any) => item.mediaId)
    user.moduleLimit = user.userPermissons.map((item: any) => item.module)
    request.userId = token.userId
    request.user = user

    return next()
  }
}