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
import { addTask } from '#services/queue_service'
import { TaskPriority } from '#type/index'
import path from 'path'
import { get_config } from '#utils/index'
import { log_p2p_error, log_p2p_info } from '#utils/p2p_log'
import p2pIdentityService from '#services/p2p/p2p_identity_service'
import TrackerClient from '#services/p2p/tracker_client'
import {
  listP2PTransferQueryValidator,
  pullP2PTransferValidator,
  clearP2PTransferValidator,
  idParamP2PValidator,
} from '#validators/p2p'

export default class P2PTransfersController {
  /**
   * 校验本机节点在 Tracker 端是否在线
   * - 本机即 tracker:直接查 tracker_node 表
   * - 远端 tracker:发一次心跳探测(心跳豁免在线检查,且成功后自动恢复 online=1)
   * @returns 错误消息,若为 null 则表示在线
   */
  private async checkNodeOnline(): Promise<string | null> {
    const config = get_config()
    const p2p = config?.p2p
    if (!p2p?.enable || !p2p?.role?.node) {
      return 'P2P 未启用或本机非节点角色'
    }

    const id = p2pIdentityService.getIdentity()
    if (!id) {
      return '本机节点身份缺失,请先等待自动注册或检查 P2P 配置'
    }

    // 本机即 tracker:直接查数据库
    if (p2p.role?.tracker) {
      const node = await prisma.tracker_node.findUnique({ where: { nodeId: id.nodeId } })
      if (!node) return '本机节点在 Tracker 数据库中不存在'
      if (node.online !== 1) return '本机节点离线,请检查心跳服务是否正常运行'
      return null
    }

    // 远端 tracker:发心跳探测
    const url = p2pIdentityService.pickTrackerUrl(p2p)
    if (!url) return '未配置 Tracker 地址'

    try {
      const client = new TrackerClient(url, id.nodeId, id.nodeToken)
      await client.heartbeat({})
      return null // 心跳成功,节点在线
    } catch (e: any) {
      const status = e?.response?.status
      const remoteMsg: string = e?.response?.data?.message || ''
      if (status === 401 || status === 403) {
        return `本机节点在 Tracker 端已失效: ${remoteMsg || '身份无效或被封禁'}`
      }
      return `无法连接 Tracker (${remoteMsg || e?.message || '网络错误'}),请检查网络或 Tracker 服务`
    }
  }

  /**
   * GET /api/p2p/transfer?status=xxx&groupNo=xxx
   */
  async index({ request, response }: HttpContext) {
    const { status, groupNo, page, pageSize } = await listP2PTransferQueryValidator.validate(
      request.qs()
    )
    let where: any = {}
    if (status) where.status = status
    if (groupNo) where.groupNo = groupNo

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
    return response.json({ code: 200, message: '', list, count })
  }

  async show({ params, response }: HttpContext) {
    const { id } = await idParamP2PValidator.validate(params)
    const item = await prisma.p2p_transfer.findUnique({ where: { p2pTransferId: id } })
    if (!item) {
      return response.status(404).json({ code: 404, message: 'not found' })
    }
    return response.json({ code: 200, message: '', data: item })
  }

  /**
   * POST /api/p2p/transfer/pull
   * body: {
   *   groupNo,
   *   transferType: 'media' | 'manga' | 'chapter',
   *   remoteMediaId? / remoteMangaId? / remoteChapterId?,
   *   remoteName,
   *   receivedPath?  (不传则使用 defaultReceivedPath)
   * }
   *
   * 多源 P2P:调用方无需指定单一对端节点。Pull Job 会在运行时从 Tracker
   * 查询群组内拥有该资源的所有节点作为候选源(seeds),按"轮询分片 + 失败换源"
   * 策略下载每一个文件。
   */
  async pull({ request, response }: HttpContext) {
    // 节点在线校验:离线节点不允许发起新拉取任务
    const onlineError = await this.checkNodeOnline()
    if (onlineError) {
      return response.status(403).json({ code: 403, message: onlineError, status: 'offline' })
    }

    const body = await pullP2PTransferValidator.validate(request.all())

    if (!body.groupNo) {
      return response.status(400).json({ code: 400, message: 'groupNo required' })
    }
    if (!body.remoteName) {
      return response.status(400).json({ code: 400, message: 'remoteName required' })
    }

    // p2p_transfer.p2pGroupId 仍是必填外键,这里仅用于满足数据库约束,不做权限语义
    const groupRow = await prisma.p2p_group.findUnique({ where: { groupNo: body.groupNo } })
    if (!groupRow) {
      return response
        .status(400)
        .json({ code: 400, message: `本地未加入群组 groupNo=${body.groupNo} (仅用于满足外键约束)` })
    }

    const transferType = body.transferType || 'chapter'
    if (transferType !== 'media' && transferType !== 'manga' && transferType !== 'chapter') {
      return response.status(400).json({ code: 400, message: 'transferType must be media | manga | chapter' })
    }
    if (transferType === 'media' && !body.remoteMediaId) {
      return response.status(400).json({ code: 400, message: 'remoteMediaId required' })
    }
    if (transferType === 'manga' && !body.remoteMangaId) {
      return response.status(400).json({ code: 400, message: 'remoteMangaId required' })
    }
    if (transferType === 'chapter' && !body.remoteChapterId) {
      return response.status(400).json({ code: 400, message: 'remoteChapterId required' })
    }

    const receivedPath =
      body.receivedPath ||
      get_config()?.p2p?.node?.defaultReceivedPath ||
      ''

    if (!receivedPath) {
      return response.status(400).json({ code: 400, message: 'receivedPath 未指定且未配置默认接收路径' })
    }

    try {
      const transfer = await prisma.p2p_transfer.create({
        data: {
          p2pGroupId: groupRow.p2pGroupId,
          groupNo: body.groupNo,
          // peerNodeId 字段保留为空:多源 P2P 下不再固定单一对端
          peerNodeId: '',
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

      log_p2p_info('transfer.pull', {
        transferId: transfer.p2pTransferId,
        groupNo: transfer.groupNo,
        transferType: transfer.transferType,
        priority,
        status: transfer.status,
      })
      return response.json({ code: 200, message: '已加入队列', data: transfer })
    } catch (e: any) {
      log_p2p_error('transfer.pull', e)
      return response.status(500).json({ code: 500, message: e?.message || '投递失败' })
    }
  }

  /**
   * POST /api/p2p/transfer/:id/cancel
   */
  async cancel({ params, response }: HttpContext) {
    const { id } = await idParamP2PValidator.validate(params)
    const item = await prisma.p2p_transfer.findUnique({ where: { p2pTransferId: id } })
    if (!item) {
      return response.status(404).json({ code: 404, message: 'not found' })
    }
    try {
      await prisma.p2p_transfer.update({
        where: { p2pTransferId: id },
        data: { status: 'canceled', endTime: new Date() },
      })
      log_p2p_info('transfer.cancel', { transferId: id })
      return response.json({ code: 200, message: '已取消' })
    } catch (e: any) {
      log_p2p_error('transfer.cancel', e)
      return response.status(500).json({ code: 500, message: e?.message || '取消失败' })
    }
  }

  /**
   * DELETE /api/p2p/transfer/:id
   *
   * 删除单条传输记录。
   * - 若任务仍在进行(pending/running),先标记为 canceled,再删除记录
   * - 不会删除已落盘的文件(receivedPath 下的内容由用户自行清理)
   */
  async destroy({ params, response }: HttpContext) {
    const { id } = await idParamP2PValidator.validate(params)
    const item = await prisma.p2p_transfer.findUnique({ where: { p2pTransferId: id } })
    if (!item) {
      return response.status(404).json({ code: 404, message: 'not found' })
    }
    try {
      // 若任务还在进行,先标记为 canceled,Job 内部的 status 检查会让它尽快退出
      if (item.status === 'pending' || item.status === 'running') {
        await prisma.p2p_transfer.update({
          where: { p2pTransferId: id },
          data: { status: 'canceled', endTime: new Date() },
        })
      }
      await prisma.p2p_transfer.delete({ where: { p2pTransferId: id } })
      log_p2p_info('transfer.destroy', {
        transferId: id,
        previousStatus: item.status,
        transferType: item.transferType,
      })
      return response.json({ code: 200, message: '已删除' })
    } catch (e: any) {
      log_p2p_error('transfer.destroy', e)
      return response.status(500).json({ code: 500, message: e?.message || '删除失败' })
    }
  }

  /**
   * POST /api/p2p/transfer/clear
   * body: { status?: 'success' | 'failed' | 'canceled' }
   *
   * 批量清理已结束的任务记录。不传 status 时清理 success + failed + canceled。
   * 永远不会删除 pending / running 状态的任务,避免影响进行中的下载。
   */
  async clear({ request, response }: HttpContext) {
    const { status } = await clearP2PTransferValidator.validate(request.all())
    const allowed = ['success', 'failed', 'canceled']
    const targetStatus = status && allowed.includes(status) ? [status] : allowed

    try {
      const result = await prisma.p2p_transfer.deleteMany({
        where: { status: { in: targetStatus } },
      })
      log_p2p_info('transfer.clear', { statuses: targetStatus, count: result.count })
      return response.json(
        { code: 200, message: `已清理 ${result.count} 条记录`, data: { count: result.count } }
      )
    } catch (e: any) {
      log_p2p_error('transfer.clear', e)
      return response.status(500).json({ code: 500, message: e?.message || '清理失败' })
    }
  }

  /**
   * POST /api/p2p/transfer/:id/retry
   */
  async retry({ params, response }: HttpContext) {
    // 节点在线校验:离线节点不允许重试任务
    const onlineError = await this.checkNodeOnline()
    if (onlineError) {
      return response.status(403).json({ code: 403, message: onlineError, status: 'offline' })
    }

    const { id } = await idParamP2PValidator.validate(params)
    const item = await prisma.p2p_transfer.findUnique({ where: { p2pTransferId: id } })
    if (!item) {
      return response.status(404).json({ code: 404, message: 'not found' })
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

      log_p2p_info('transfer.retry', {
        transferId: id,
        transferType: item.transferType,
        priority,
      })
      return response.json({ code: 200, message: '已重新入队' })
    } catch (e: any) {
      log_p2p_error('transfer.retry', e)
      return response.status(500).json({ code: 500, message: e?.message || '重试失败' })
    }
  }
}
