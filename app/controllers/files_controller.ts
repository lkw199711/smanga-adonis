import { activePath, activeChapter, isArchivedLibraryFile } from '#services/library_visibility'
import type { HttpContext } from '@adonisjs/core/http'
import fs from 'fs'
import path from 'path'
import { get_os, is_img, path_compress } from '#utils/index'
import { fileQueryValidator } from '#validators/file'
import prisma from '#start/prisma'
import { isWithinLibraryDirectory, LibraryPathContext } from '#services/library_path_service'

// 获取所有媒体库允许的路径前缀
async function getAllowedPaths(): Promise<string[]> {
  const paths = await prisma.path.findMany({
    where: activePath,
    include: { storageRoot: true },
  })
  const allowedPaths: string[] = []
  for (const pathInfo of paths) {
    try {
      allowedPaths.push(new LibraryPathContext(pathInfo).resolve(pathInfo.pathContent))
    } catch {
      // 单个存储根停用时，其他媒体库仍然可读。
    }
  }
  return allowedPaths
}

function isPathAllowed(filePath: string, allowedPaths: string[]): boolean {
  return allowedPaths.some((allowed) => isWithinLibraryDirectory(allowed, filePath))
}

async function isActiveCompressFile(file: string) {
  const root = path_compress()
  if (!isWithinLibraryDirectory(root, file)) return false
  const topDirectory = path.relative(root, file).split(path.sep)[0]
  if (!topDirectory) return false
  return Boolean(await prisma.compress.findFirst({
    where: { compressPath: path.join(root, topDirectory), chapter: activeChapter },
    select: { compressId: true },
  }))
}

export default class FilesController {
  public async index({ request, response }: HttpContext) {
    const { file } = await fileQueryValidator.validate(request.qs())

    // 路径安全校验：只允许访问媒体库路径和解压目录下的文件
    const allowedPaths = await getAllowedPaths()
    if (await isArchivedLibraryFile(file) ||
        (!isPathAllowed(file, allowedPaths) && !(await isActiveCompressFile(file)))) {
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
    let fileDir = '/data/file'
    if (get_os() === 'Windows') {
      fileDir = './data/file'
    }

    // 扫描目录取最新的 apk，避免硬编码文件名导致版本更新后 404
    const apkFiles = fs.existsSync(fileDir)
      ? fs.readdirSync(fileDir).filter((name) => name.toLowerCase().endsWith('.apk'))
      : []
    if (apkFiles.length === 0) {
      return response.status(400).json({
        message: '文件不存在',
        error: 'file error.',
      })
    }

    const latestApk = apkFiles
      .map((name) => ({ name, mtime: fs.statSync(path.join(fileDir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0].name
    const apkPath = path.join(fileDir, latestApk)

    response.attachment(apkPath)
    return response.send(fs.readFileSync(apkPath))
  }
}
