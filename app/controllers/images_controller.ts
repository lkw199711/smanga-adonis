import { is_img } from '#utils/index'
import type { HttpContext } from '@adonisjs/core/http'
import fs from 'fs'

export default class ImagesController {
  public async index({ request, response }: HttpContext) {
    const { file } = request.body()
    // 检查文件是否存在
    if (!fs.existsSync(file)) {
      return response.status(400).json({
        message: '图片路径错误',
        error: 'image error.',
      })
    }

    let fileType = 'image/jpeg'
    if (is_img(file) === false) {
      fileType = 'application/octet-stream'
    }

    // 设置文件的MIME类型，这里假设你要返回JPEG图片
    response.header('Content-Type', fileType)

    // 使用StreamedResponse返回图片文件流
    response.stream(fs.createReadStream(file))
  }
}
