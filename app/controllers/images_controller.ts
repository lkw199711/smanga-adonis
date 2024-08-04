/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-31 20:21:50
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-03 12:12:44
 * @FilePath: \smanga-adonis\app\controllers\images_controller.ts
 */
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

    // 设置文件的MIME类型，这里假设你要返回JPEG图片
    response.header('Content-Type', 'image/jpeg')

    // 使用StreamedResponse返回图片文件流
    response.stream(fs.createReadStream(file))
  }
}
