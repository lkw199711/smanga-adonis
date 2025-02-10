/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-15 19:21:48
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-02-10 21:36:55
 * @FilePath: \smanga-adonis\app\controllers\paths_controller.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '#interfaces/response'
import { TaskPriority } from '#type/index'
import { scanQueue } from '#services/queue_service'
import { get_config } from '#utils/index'
import scan_job from '#services/scan_job'
import delete_path_job from '#services/delete_path_job'
import delete_manga_job from '#services/delete_manga_job'

// 才用同步还是异步的方式执行扫描任务
const config = get_config()
const dispatchSync = config.debug.dispatchSync == 1
export default class PathsController {
  public async index({ request, response }: HttpContext) {
    const { mediaId, page, pageSize } = request.only(['mediaId', 'page', 'pageSize'])
    const queryParams = {
      ...(page && {
        skip: (page - 1) * pageSize,
        take: pageSize,
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

    const listResponse = new ListResponse({
      code: 0,
      message: '',
      list,
      count: count,
    })
    return response.json(listResponse)
  }

  public async show({ params, response }: HttpContext) {
    let { pathId } = params
    pathId = Number(pathId)
    const path = await prisma.path.findUnique({ where: { pathId } })
    const showResponse = new SResponse({ code: 0, message: '', data: path })
    return response.json(showResponse)
  }

  public async create({ request, response }: HttpContext) {
    let path = null
    const insertData = request.only(['pathContent', 'mediaId', 'autoScan', 'include', 'exclude'])
    path = await prisma.path.findFirst({
      where: {
        pathContent: insertData.pathContent,
        mediaId: insertData.mediaId,
      },
    })

    if (!path) {
      path = await prisma.path.create({
        data: insertData,
      })
    } else if (path?.deleteFlag === 1) {
      await prisma.path.update({
        where: { pathId: path.pathId },
        data: { deleteFlag: 0 },
      })
    } else {
      const saveResponse = new SResponse({ code: 1, message: '路径已存在', data: path })
      return response.json(saveResponse)
    }

    if (dispatchSync) {
      scan_job({ pathId: path.pathId })
    } else {
      scanQueue.add({
        taskName: `scan_${path.pathId}`,
        command: 'taskScan',
        args: { pathId: path.pathId }
      }, {
        priority: TaskPriority.scan
      })
    }

    const saveResponse = new SResponse({ code: 0, message: '新增成功,扫描任务已提交', data: path })

    return response.json(saveResponse)
  }

  public async update({ params, request, response }: HttpContext) {
    let { pathId } = params
    pathId = Number(pathId)
    const modifyData = request.body()
    const path = await prisma.path.update({
      where: { pathId },
      data: modifyData,
    })
    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: path })
    return response.json(updateResponse)
  }

  public async destroy({ params, response }: HttpContext) {
    let { pathId } = params
    const path = await prisma.path.update({ where: { pathId }, data: { deleteFlag: 1 } })

    if (dispatchSync) {
      delete_path_job(path.pathId)
    } else {
      scanQueue.add({
        taskName: `delete_path_${path.pathId}`,
        command: 'deletePath',
        args: { pathId: path.pathId }
      }, {
        priority: TaskPriority.delete
      })
    }

    const destroyResponse = new SResponse({ code: 0, message: '删除成功', data: path })
    return response.json(destroyResponse)
  }

  public async scan({ params, response }: HttpContext) {
    let { pathId } = params

    if (dispatchSync) {
      scan_job({ pathId: pathId })
    } else {
      scanQueue.add({
        taskName: `scan_${pathId}`,
        command: 'taskScan',
        args: { pathId }
      }, {
        priority: TaskPriority.scan
      })
    }

    const scanResponse = new SResponse({ code: 0, message: '扫描任务已提交', data: { pathId } })
    return response.json(scanResponse)
  }

  public async re_scan({ params, response }: HttpContext) {
    let { pathId } = params
    const mangas = await prisma.manga.findMany({ where: { pathId } })
    // 删除此路径现有漫画
    for (let index = 0; index < mangas.length; index++) {
      const manga = mangas[index];
      if (dispatchSync) {
        delete_manga_job(manga.mangaId)
      } else {
        scanQueue.add({
          taskName: `delete_manga_${manga.mangaId}`,
          command: 'deleteManga',
          args: { mangaId: manga.mangaId }
        }, {
          priority: TaskPriority.deleteManga
        })
      }
    }

    // 再次扫描路径
    if (dispatchSync) {
      scan_job({ pathId })
    } else {
      scanQueue.add({
        taskName: `re_scan_${pathId}`,
        command: 'taskScan',
        args: { pathId }
      }, {
        priority: TaskPriority.scan
      })
    }

    const scanResponse = new SResponse({ code: 0, message: '重新扫描任务已提交', data: pathId })
    return response.json(scanResponse)
  }
}
