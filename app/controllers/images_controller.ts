import { is_img, path_poster } from '#utils/index'
import type { HttpContext } from '@adonisjs/core/http'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { SResponse } from '#interfaces/response'

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

  /**
   * 上传海报图片
   * 根据mangaId或chapterId将图片保存在poster目录中
   */
  public async upload({ request, response }: HttpContext) {
    // 获取请求参数
    const mangaId = request.input('mangaId')
    const chapterId = request.input('chapterId')
    const mediaId = request.input('mediaId')

    // 获取上传的文件
    const imageFile = request.file('image')
    if (!imageFile) {
      const errorResponse = new SResponse({
        code: 1,
        message: '未找到上传的图片文件',
        error: 'No image file uploaded',
      })
      return response.status(400).json(errorResponse)
    }

    // 验证文件类型
    if (!is_img(imageFile.clientName)) {
      const errorResponse = new SResponse({
        code: 1,
        message: '不支持的图片格式',
        error: 'Unsupported image format',
      })
      return response.status(400).json(errorResponse)
    }

    // 获取保存目录
    const posterDir = path_poster()

    // 确保目录存在
    if (!fs.existsSync(posterDir)) {
      fs.mkdirSync(posterDir, { recursive: true })
    }

    // 生成文件名（使用UUID确保唯一性）
    let posterType = ''
    let bindId = 0
    if (mangaId) {
      posterType = 'manga'
      bindId = mangaId
    } else if (chapterId) {
      posterType = 'chapter'
      bindId = chapterId
    } else if (mediaId) {
      posterType = 'media'
      bindId = mediaId
    } else {
      const errorResponse = new SResponse({
        code: 1,
        message: '必须提供mangaId、chapterId或mediaId',
        error: 'Missing required parameters',
      })
      return response.status(400).json(errorResponse)
    }
    const fileName = `smanga_${posterType}_${bindId}.jpg`
    const filePath = path.join(posterDir, fileName)

    // 保存文件
    await imageFile.move(posterDir, {
      name: fileName,
      overwrite: true,
    })

    // 返回成功响应
    const successResponse = new SResponse({
      code: 0,
      message: '图片上传成功',
      data: {
        filePath: filePath,
        fileName: fileName,
        mangaId: mangaId,
        chapterId: chapterId,
        mediaId: mediaId,
      },
    })
    return response.status(200).json(successResponse)
  }
}
