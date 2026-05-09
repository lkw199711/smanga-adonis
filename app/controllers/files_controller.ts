import type { HttpContext } from '@adonisjs/core/http'
import fs from 'fs'
import path from 'path'
import { get_os, is_img, path_compress } from '#utils/index'
import { fileQueryValidator } from '#validators/file'
import prisma from '#start/prisma'

// 获取所有媒体库允许的路径前缀
async function getAllowedPaths(): Promise<string[]> {
  const paths = await prisma.path.findMany({ select: { pathContent: true } })
  const allowedPaths = paths.map((p) => p.pathContent)
  // 同时允许 compress 目录
  allowedPaths.push(path_compress())
  return allowedPaths
}

function isPathAllowed(filePath: string, allowedPaths: string[]): boolean {
  const normalizedFile = path.resolve(filePath)
  return allowedPaths.some((allowed) => normalizedFile.startsWith(path.resolve(allowed)))
}

export default class FilesController {
  public async index({ request, response }: HttpContext) {
    const { file } = await fileQueryValidator.validate(request.qs())

    // 路径安全校验：只允许访问媒体库路径和解压目录下的文件
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

  public async apk({ response }: HttpContext) {
    let apkPath = '/data/file/smanga-1.2.apk'
    if (get_os() === 'Windows') {
      apkPath = './data/file/smanga-1.2.apk'
    }

    // 检查文件是否存在
    if (!fs.existsSync(apkPath)) {
      return response.status(400).json({
        message: '文件不存在',
        error: 'file error.',
      })
    }

    response.attachment(apkPath)
    return response.send(fs.readFileSync(apkPath))
  }
}