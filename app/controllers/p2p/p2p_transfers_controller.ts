/**
 * P2P 传输任务控制器(用户侧)
 *
 * 路径:/api/p2p/transfer/*
 *
 * 职责:
 *  - 创建传输任务记录 + 投递到 Bull 队列
 *  - 列表 / 查询 / 取消 / 重试
 */

import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '#interfaces/response'
import { addTask } from '#services/queue_service'
import { TaskPriority } from '#type/index'
import path from 'path'
import { get_config } from '#utils/index'
import { log_p2p_error } from '#utils/p2p_log'

export default class P2PTransfersController {
  /**
   * GET /api/p2p/transfer?status=xxx&groupNo=xxx
   */
  async index({ request, response }: HttpContext) {
    const { status, groupNo, page, pageSize } = request.only([
      'status', 'groupNo', 'page', 'pageSize',
    ])
    let where: any = {}
    if (status) where.status = status
    if (groupNo) {
      const g = await prisma.p2p_group.findUnique({ where: { groupNo } })
      if (!g) {
        return response.json(new ListResponse({ code: 0, message: '', list: [], count: 0 }))
      }
      where.p2pGroupId = g.p2pGroupId
    }

    const queryParams: any = {
      where,
      orderBy: { createTime: 'desc' },
    }
    if (page && pageSize) {
      queryParams.skip = (page - 1) * pageSize
      queryParams.take = pageSize
    }

    const [list, count] = await Promise.all([
      prisma.p2p_transfer.findMany(queryParams),
      prisma.p2p_transfer.count({ where }),
    ])
    return response.json(new ListResponse({ code: 0, message: '', list, count }))
  }

  async show({ params, response }: HttpContext) {
    const id = Number(params.id)
    const item = await prisma.p2p_transfer.findUnique({ where: { p2pTransferId: id } })
    if (!item) {
      return response.status(404).json(new SResponse({ code: 1, message: 'not found' }))
    }
    return response.json(new SResponse({ code: 0, message: '', data: item }))
  }

  /**
   * POST /api/p2p/transfer/pull
   * body: {
   *   groupNo, peerNodeId,
   *   transferType: 'media' | 'manga' | 'chapter',
   *   remoteMediaId? / remoteMangaId? / remoteChapterId?,
   *   remoteName,
   *   receivedPath?  (不传则使用 defaultReceivedPath)
   * }
   */
  async pull({ request, response }: HttpContext) {
    const body = request.only([
      'groupNo', 'peerNodeId', 'transferType',
      'remoteMediaId', 'remoteMangaId', 'remoteChapterId',
      'remoteName', 'receivedPath',
    ])

    if (!body.groupNo) {
      return response.status(400).json(new SResponse({ code: 1, message: 'groupNo required' }))
    }
    const group = await prisma.p2p_group.findUnique({ where: { groupNo: body.groupNo } })
    if (!group) {
      return response.status(400).json(new SResponse({ code: 1, message: '群组不存在' }))
    }

    if (!body.peerNodeId) {
      return response.status(400).json(new SResponse({ code: 1, message: 'peerNodeId required' }))
    }
    if (!body.remoteName) {
      return response.status(400).json(new SResponse({ code: 1, message: 'remoteName required' }))
    }

    const transferType = body.transferType || 'chapter'
    if (transferType !== 'media' && transferType !== 'manga' && transferType !== 'chapter') {
      return response.status(400).json(new SResponse({ code: 1, message: 'transferType must be media | manga | chapter' }))
    }
    if (transferType === 'media' && !body.remoteMediaId) {
      return response.status(400).json(new SResponse({ code: 1, message: 'remoteMediaId required' }))
    }
    if (transferType === 'manga' && !body.remoteMangaId) {
      return response.status(400).json(new SResponse({ code: 1, message: 'remoteMangaId required' }))
    }
    if (transferType === 'chapter' && !body.remoteChapterId) {
      return response.status(400).json(new SResponse({ code: 1, message: 'remoteChapterId required' }))
    }

    const receivedPath =
      body.receivedPath ||
      get_config()?.p2p?.node?.defaultReceivedPath ||
      ''

    if (!receivedPath) {
      return response.status(400).json(
        new SResponse({ code: 1, message: 'receivedPath 未指定且未配置默认接收路径' })
      )
    }

    try {
      const transfer = await prisma.p2p_transfer.create({
        data: {
          p2pGroupId: group.p2pGroupId,
          peerNodeId: body.peerNodeId,
          transferType,
          remoteMediaId: body.remoteMediaId ? Number(body.remoteMediaId) : null,
          remoteMangaId: body.remoteMangaId ? Number(body.remoteMangaId) : null,
          remoteChapterId: body.remoteChapterId ? Number(body.remoteChapterId) : null,
          remoteName: body.remoteName,
          receivedPath: path.resolve(receivedPath),
          status: 'pending',
        },
      })

      // 投递到 Bull 队列
      let priority: number = TaskPriority.p2pPullChapter
      if (transfer.transferType === 'manga') priority = TaskPriority.p2pPullManga
      if (transfer.transferType === 'media') priority = TaskPriority.p2pPullMedia

      await addTask({
        taskName: `p2p_pull_${transfer.p2pTransferId}`,
        command: 'taskP2PPull',
        args: { transferId: transfer.p2pTransferId },
        priority,
      })

      return response.json(new SResponse({ code: 0, message: '已加入队列', data: transfer }))
    } catch (e: any) {
      log_p2p_error('transfer.pull', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || '投递失败' }))
    }
  }

  /**
   * POST /api/p2p/transfer/:id/cancel
   */
  async cancel({ params, response }: HttpContext) {
    const id = Number(params.id)
    const item = await prisma.p2p_transfer.findUnique({ where: { p2pTransferId: id } })
    if (!item) {
      return response.status(404).json(new SResponse({ code: 1, message: 'not found' }))
    }
    try {
      await prisma.p2p_transfer.update({
        where: { p2pTransferId: id },
        data: { status: 'canceled', endTime: new Date() },
      })
      return response.json(new SResponse({ code: 0, message: '已取消' }))
    } catch (e: any) {
      log_p2p_error('transfer.cancel', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || '取消失败' }))
    }
  }

  /**
   * POST /api/p2p/transfer/:id/retry
   */
  async retry({ params, response }: HttpContext) {
    const id = Number(params.id)
    const item = await prisma.p2p_transfer.findUnique({ where: { p2pTransferId: id } })
    if (!item) {
      return response.status(404).json(new SResponse({ code: 1, message: 'not found' }))
    }
    try {
      await prisma.p2p_transfer.update({
        where: { p2pTransferId: id },
        data: { status: 'pending', error: null, progress: 0, endTime: null, startTime: null },
      })

      let priority: number = TaskPriority.p2pPullChapter
      if (item.transferType === 'manga') priority = TaskPriority.p2pPullManga
      if (item.transferType === 'media') priority = TaskPriority.p2pPullMedia

      await addTask({
        taskName: `p2p_pull_${id}`,
        command: 'taskP2PPull',
        args: { transferId: id },
        priority,
      })

      return response.json(new SResponse({ code: 0, message: '已重新入队' }))
    } catch (e: any) {
      log_p2p_error('transfer.retry', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || '重试失败' }))
    }
  }
}