import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { get_config } from '#utils/index'
import log from '#services/log_service'

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default class RequestLogMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const startAt = Date.now()

    await next()

    const durationMs = Date.now() - startAt
    const statusCode = ctx.response.getStatus()
    const method = ctx.request.method().toUpperCase()

    const config = get_config()?.logging?.http || {}
    const slowMs = Number(config.slowMs || 1000)
    const logSuccess = config.logSuccess === true

    const baseEvent = {
      type: 'http' as const,
      module: 'http',
      message: `${method} ${ctx.request.url()} -> ${statusCode} (${durationMs}ms)`,
      userId: (ctx.request as any).userId ?? null,
      context: {
        method,
        url: ctx.request.url(),
        requestId: ctx.request.id?.(),
        statusCode,
        durationMs,
        params: ctx.request.params(),
        query: ctx.request.qs(),
      },
      device: {
        requestId: ctx.request.id?.(),
        ip: ctx.request.ip(),
        userAgent: ctx.request.header('user-agent'),
        method,
        url: ctx.request.url(),
      },
    }

    const shouldPersist =
      statusCode >= 500 ||
      statusCode === 401 ||
      statusCode === 403 ||
      durationMs >= slowMs ||
      WRITE_METHODS.has(method) ||
      logSuccess

    ctx.logger.info(
      {
        requestId: ctx.request.id?.(),
        userId: (ctx.request as any).userId ?? null,
        statusCode,
        durationMs,
      },
      `${method} ${ctx.request.url()}`
    )

    if (!shouldPersist) {
      return
    }

    if (statusCode >= 500) {
      await log.error({ ...baseEvent, action: 'request.failed' })
      return
    }

    if (statusCode === 401 || statusCode === 403) {
      await log.warn({ ...baseEvent, action: 'request.denied' })
      return
    }

    if (durationMs >= slowMs) {
      await log.warn({ ...baseEvent, action: 'request.slow' })
      return
    }

    await log.info({ ...baseEvent, action: 'request.completed' })
  }
}