import { is_img, path_poster, path_compress } from '#utils/index'
import type { HttpContext } from '@adonisjs/core/http'
import fs from 'fs'
import path from 'path'
import { imageFileBodyValidator, uploadImageBodyValidator } from '#validators/image'
import prisma from '#start/prisma'

// 获取所有媒体库允许的路径前缀
async function getAllowedPaths(): Promise<string[]> {
  const paths = await prisma.path.findMany({ select: { pathContent: true } })
  const allowedPaths = paths.map((p) => p.pathContent)
  allowedPaths.push(path_compress())
  allowedPaths.push(path_poster())
  return allowedPaths
}

function isPathAllowed(filePath: string, allowedPaths: string[]): boolean {
  const normalizedFile = path.resolve(filePath)
  return allowedPaths.some((allowed) => normalizedFile.startsWith(path.resolve(allowed)))
}

export default class ImagesController {
  public async index({ request, response }: HttpContext) {
    const { file } = await imageFileBodyValidator.validate(request.all())

    // 路径安全校验
    const allowedPaths = await getAllowedPaths()
    if (!isPathAllowed(file, allowedPaths)) {
      return response.status(403).json({
        message: '无权访问该路径',
        error: 'path not allowed.',
      })
    }

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

    response.header('Content-Type', fileType)
    response.stream(fs.createReadStream(file))
  }

  /**
   * 上传海报图片
   * 根据mangaId或chapterId将图片保存在poster目录中
   */
  public async upload({ request, response }: HttpContext) {
    // 权限校验：仅管理员可上传海报
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      return response
        .status(403)
        .json({ code: 403, message: '没有权限操作', status: 'no permission' })
    }

    // 获取请求参数
    const { mangaId, chapterId, mediaId } = await uploadImageBodyValidator.validate(request.all())

    // 获取上传的文件
    const imageFile = request.file('image')
    if (!imageFile) {
      return response
        .status(400)
        .json({ code: 400, message: '未找到上传的图片文件', error: 'No image file uploaded' })
    }

    // 验证文件类型
    if (!is_img(imageFile.clientName)) {
      return response
        .status(400)
        .json({ code: 400, message: '不支持的图片格式', error: 'Unsupported image format' })
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
      return response
        .status(400)
        .json({ code: 400, message: '必须提供mangaId、chapterId或mediaId', error: 'Missing required parameters' })
    }
    const fileName = `smanga_${posterType}_${bindId}.jpg`
    const filePath = path.join(posterDir, fileName)

    // 保存文件
    await imageFile.move(posterDir, {
      name: fileName,
      overwrite: true,
    })

    // 返回成功响应
    return response.status(200).json({
      code: 200,
      message: '图片上传成功',
      data: { filePath, fileName, mangaId, chapterId, mediaId },
    })
  }
}
