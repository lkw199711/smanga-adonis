import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { TaskPriority } from '#type/index'
import { addTask } from '#services/queue_service'
import { create_scan_cron } from '#services/cron_service'
import ScanDiscoveryService from '#services/scan/scan_discovery_service'
import ScanReportService from '#services/scan/scan_report_service'
import { get_config } from '#utils/index'
import fs from 'fs'
import {
  listPathValidator,
  idParamPathValidator,
  createPathValidator,
  updatePathValidator,
  batchIdsParamPathValidator,
  previewPathValidator,
} from '#validators/path'

export default class PathsController {
  private discoveryService = new ScanDiscoveryService()
  private reportService = new ScanReportService()

  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  public async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mediaId, page, pageSize } = await listPathValidator.validate(request.qs())
    const queryParams = {
      ...(page && {
        skip: (page - 1) * (pageSize ?? 10),
        take: pageSize ?? 10,
      }),
      where: {
        ...(mediaId && { mediaId }),
        deleteFlag: 0,
      },
    }

    const [list, count] = await Promise.all([
      prisma.path.findMany(queryParams),
      prisma.path.count({ where: queryParams.where }),
    ])

    return response.json({ code: 200, message: '', list, count })
  }

  public async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathId } = await idParamPathValidator.validate(params)
    const path = await prisma.path.findUnique({ where: { pathId } })
    return response.json({ code: 200, message: '', data: path })
  }

  private async buildDiscoveryInputFromPath(pathId: number) {
    const pathInfo = await prisma.path.findUnique({
      where: { pathId },
      include: { media: true },
    })

    if (!pathInfo || !pathInfo.media) return null

    return {
      mediaId: pathInfo.mediaId,
      pathId: pathInfo.pathId,
      pathContent: pathInfo.pathContent,
      mediaType: pathInfo.media.mediaType,
      directoryFormat: pathInfo.media.directoryFormat,
      include: pathInfo.include,
      exclude: pathInfo.exclude,
      ignoreHiddenFiles: get_config().scan?.ignoreHiddenFiles === 1,
      isCloudMedia: pathInfo.media.isCloudMedia,
    }
  }

  public async preview({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathId } = await idParamPathValidator.validate(params)
    const input = await this.buildDiscoveryInputFromPath(pathId)
    if (!input) {
      return response.status(404).json({ code: 404, message: '路径或媒体库不存在' })
    }

    const result = this.discoveryService.discoverPath(input)
    return response.json({ code: 200, message: '', data: result })
  }

  public async preview_unsaved({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const data = await previewPathValidator.validate(request.all())
    const media = data.mediaId
      ? await prisma.media.findUnique({ where: { mediaId: data.mediaId } })
      : null

    const result = this.discoveryService.discoverPath({
      mediaId: data.mediaId,
      pathContent: data.pathContent,
      mediaType: data.mediaType ?? media?.mediaType ?? 0,
      directoryFormat: data.directoryFormat ?? media?.directoryFormat ?? 0,
      include: data.include,
      exclude: data.exclude,
      ignoreHiddenFiles: get_config().scan?.ignoreHiddenFiles === 1,
      isCloudMedia: data.isCloudMedia ?? media?.isCloudMedia ?? 0,
    })

    return response.json({ code: 200, message: '', data: result })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    let path = null
    const insertData = await createPathValidator.validate(request.all())

    // 检查路径是否存在
    if (!fs.existsSync(insertData.pathContent)) {
      return response.status(400).json({ code: 400, message: '路径不存在', data: null })
    }

    path = await prisma.path.findFirst({
      where: {
        pathContent: insertData.pathContent,
        mediaId: insertData.mediaId,
      },
    })

    if (!path) {
      path = await prisma.path.create({
        data: insertData as any,
      })
    } else if (path?.deleteFlag === 1) {
      await prisma.path.update({
        where: { pathId: path.pathId },
        data: { deleteFlag: 0 },
      })
    } else {
      return response.status(400).json({ code: 400, message: '路径已存在', data: path })
    }

    // 添加自动扫描任务
    if (path.autoScan == 1) {
      create_scan_cron()
    }

    const scanRun = await this.reportService.createRun({
      runType: 'incremental',
      triggerType: 'createPath',
      mediaId: path.mediaId,
      pathId: path.pathId,
      pathContent: path.pathContent,
    })

    // 扫描路径
    await addTask({
      taskName: `scan_path_${path.pathId}`,
      command: 'taskScanPath',
      args: { pathId: path.pathId, scanRunId: scanRun.scanRunId },
      priority: TaskPriority.scan,
    })

    return response.json({
      code: 200,
      message: '新增成功,扫描任务已提交',
      data: { ...path, scanRunId: scanRun.scanRunId },
    })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathId } = await idParamPathValidator.validate(params)
    const modifyData = await updatePathValidator.validate(request.all())
    const path = await prisma.path.update({
      where: { pathId },
      data: modifyData,
    })

    // 如果路径被更新为自动扫描,则添加自动扫描任务
    if (modifyData.autoScan == 1) {
      create_scan_cron()
    }

    return response.json({ code: 200, message: '更新成功', data: path })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathId } = await idParamPathValidator.validate(params)
    const path = await prisma.path.update({ where: { pathId }, data: { deleteFlag: 1 } })

    await addTask({
      taskName: `delete_path_${path.pathId}`,
      command: 'deletePath',
      args: { pathId: path.pathId },
      priority: TaskPriority.delete,
    })

    return response.json({ code: 200, message: '删除成功', data: path })
  }

  public async destroy_batch({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathIds } = await batchIdsParamPathValidator.validate(params)
    const paths = await prisma.path.updateMany({
      where: { pathId: { in: pathIds } },
      data: { deleteFlag: 1 },
    })

    for (const id of pathIds) {
      await addTask({
        taskName: `delete_path_${id}`,
        command: 'deletePath',
        args: { pathId: id },
        priority: TaskPriority.delete,
      })
    }

    return response.json({ code: 200, message: '删除成功', data: paths })
  }

  public async scan({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathId } = await idParamPathValidator.validate(params)
    const path = await prisma.path.findUnique({ where: { pathId } })
    if (!path) {
      return response.status(404).json({ code: 404, message: '路径不存在' })
    }

    const scanRun = await this.reportService.createRun({
      runType: 'incremental',
      triggerType: 'manual',
      mediaId: path.mediaId,
      pathId: path.pathId,
      pathContent: path.pathContent,
    })

    const task = await addTask({
      taskName: `scan_path_${pathId}`,
      command: 'taskScanPath',
      args: { pathId, scanRunId: scanRun.scanRunId },
      priority: TaskPriority.scan,
    })

    if (!task) {
      await this.reportService.finishFailed(scanRun.scanRunId, '路径正在被扫描，任务未重复提交')
    }

    return response.json({
      code: 200,
      message: task ? '扫描任务已提交' : '路径正在被扫描，未重复提交',
      data: { pathId, scanRunId: scanRun.scanRunId },
    })
  }

  public async re_scan({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { pathId } = await idParamPathValidator.validate(params)
    const path = await prisma.path.findUnique({ where: { pathId } })
    if (!path) {
      return response.status(404).json({ code: 404, message: '路径不存在' })
    }

    const scanRun = await this.reportService.createRun({
      runType: 'rescan',
      triggerType: 'manual',
      mediaId: path.mediaId,
      pathId: path.pathId,
      pathContent: path.pathContent,
      message: '重新扫描会先删除路径下已有漫画，再按当前目录重新创建',
    })

    const mangas = await prisma.manga.findMany({ where: { pathId } })
    // 删除此路径现有漫画
    for (const manga of mangas) {
      await addTask({
        taskName: `delete_manga_${manga.mangaId}`,
        command: 'deleteManga',
        args: { mangaId: manga.mangaId },
        priority: TaskPriority.deleteManga,
      })
    }

    // 再次扫描路径
    await addTask({
      taskName: `scan_path_${pathId}`,
      command: 'taskScanPath',
      args: { pathId, scanRunId: scanRun.scanRunId },
      priority: TaskPriority.scan,
    })

    return response.json({
      code: 200,
      message: '重新扫描任务已提交',
      data: { pathId, scanRunId: scanRun.scanRunId },
    })
  }
}
