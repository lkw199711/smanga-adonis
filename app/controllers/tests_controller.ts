import type { HttpContext } from '@adonisjs/core/http'
import { get_config } from '#utils/index'
// import { TaskPriority } from '#type/index'
import { SResponse } from '#interfaces/response'

export default class TestsController {
  public async index({ response }: HttpContext) {
    const config = get_config()
    const res = new SResponse({ code: 0, data: config, message: '操作成功' })
    return response.status(200).send(res)
  }
}
