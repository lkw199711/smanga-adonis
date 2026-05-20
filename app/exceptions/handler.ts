import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import { errors as vineErrors } from '@vinejs/vine'
import log from '#services/log_service'

export default class HttpExceptionHandler extends ExceptionHandler {
  protected debug = !app.inProduction

  async handle(error: unknown, ctx: HttpContext) {
    if (error instanceof vineErrors.E_VALIDATION_ERROR) {
      return ctx.response.status(422).json({
        code: 422,
        message: '参数校验失败',
        error: this.debug ? (error as any).messages : undefined,
        status: 'validation_error',
      })
    }

    return super.handle(error, ctx)
  }

  async report(error: unknown, ctx: HttpContext) {
    if (!ctx) {
      return super.report(error, ctx)
    }

    const statusCode = Number((error as any)?.status || (error as any)?.statusCode || 500)

    if (statusCode === 401 || statusCode === 403) {
      return super.report(error, ctx)
    }

    const base = log.fromHttpContext(ctx)

    if (error instanceof vineErrors.E_VALIDATION_ERROR) {
      await log.warn({
        type: 'http',
        module: 'http',
        action: 'request.validation_failed',
        message: `${ctx.request.method()} ${ctx.request.url()} validation failed`,
        userId: base.userId,
        context: {
          ...base.context,
          statusCode,
          details: (error as any).messages,
        },
        device: base.device,
      })

      return super.report(error, ctx)
    }

    await log.error({
      type: 'http',
      module: 'http',
      action: 'request.unhandled_exception',
      message: `${ctx.request.method()} ${ctx.request.url()} failed with ${statusCode}`,
      error,
      userId: base.userId,
      context: {
        ...base.context,
        statusCode,
      },
      device: base.device,
    })

    return super.report(error, ctx)
  }
}