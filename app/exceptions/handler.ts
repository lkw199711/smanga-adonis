import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import { errors as vineErrors } from '@vinejs/vine'
import { SResponse, SResponseCode } from '../interfaces/response.js'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    // VineJS 参数校验失败 -> 统一业务错误格式 (HTTP 200 + code=1),
    // 保持与项目内 SResponse 口径一致,前端现有 code !== 0 分支可直接处理
    if (error instanceof vineErrors.E_VALIDATION_ERROR) {
      return ctx.response.json(
        new SResponse({
          code: SResponseCode.Failed,
          message: '参数校验失败',
          // debug 模式透出字段级详情,生产环境不回抛内部细节
          error: this.debug ? (error as any).messages : undefined,
          status: 'validation_error',
        })
      )
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
