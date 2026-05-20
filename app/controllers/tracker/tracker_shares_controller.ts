import type { HttpContext } from '@adonisjs/core/http'
import trackerShareService from '#services/tracker/tracker_share_service'
import { log_tracker_error, log_tracker_info } from '#utils/p2p_log'
import {
  announceTrackerShareValidator,
  seedsTrackerShareValidator,
  manifestsTrackerShareValidator,
  manifestTrackerShareValidator,
  listTrackerShareValidator,
  trackerGroupNoParamValidator,
} from '#validators/tracker'

/**
 * Tracker 共享索引接口
 * 路由: /tracker/group/:groupNo/shares , /tracker/group/:groupNo/announce
 */
export default class TrackerSharesController {
  /**
   * POST /tracker/group/:groupNo/announce
   */
  async announce({ params, request, response }: HttpContext) {
    try {
      const nodeId = (request as any).trackerNodeId as string
      const { groupNo } = await trackerGroupNoParamValidator.validate(params)
      const payload = await announceTrackerShareValidator.validate(request.all())
      const result = await trackerShareService.announce(
        nodeId,
        groupNo,
        payload as any
      )
      log_tracker_info('share.announce', {
        nodeId,
        groupNo,
        shareCount: Array.isArray((payload as any)?.shares) ? (payload as any).shares.length : 0,
      })
      return response.json({ code: 200, message: '上报成功', data: result })
    } catch (err: any) {
      log_tracker_error('share.announce', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }

  /**
   * GET /tracker/group/:groupNo/seeds?shareType=&remoteMediaId=&remoteMangaId=
   * 返回拥有该资源的节点列表(在线优先),供拉取任务做多源选择
   */
  async seeds({ params, request, response }: HttpContext) {
    try {
      const { groupNo } = await trackerGroupNoParamValidator.validate(params)
      const { shareType, remoteMediaId, remoteMangaId } =
        await seedsTrackerShareValidator.validate(request.qs())
      const { list, count } = await trackerShareService.findSeeds(groupNo, {
        shareType: shareType as any,
        remoteMediaId: remoteMediaId ? Number(remoteMediaId) : undefined,
        remoteMangaId: remoteMangaId ? Number(remoteMangaId) : undefined,
      })
      log_tracker_info('share.seeds', {
        groupNo,
        shareType,
        remoteMediaId: remoteMediaId ? Number(remoteMediaId) : undefined,
        remoteMangaId: remoteMangaId ? Number(remoteMangaId) : undefined,
        count,
      })
      return response.json(
        { code: 200, message: '', list: list as any, count }
      )
    } catch (err: any) {
      log_tracker_error('share.seeds', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }

  /**
   * GET /tracker/group/:groupNo/manifests?since=&nodeId=
   * 批量拉取该群所有节点的 manifest 摘要(不含 payload)
   * - since: 毫秒时间戳,只返回 updateTime > since 的(增量)
   * - nodeId: 仅查指定节点(可选)
   */
  async manifests({ params, request, response }: HttpContext) {
    try {
      const { groupNo } = await trackerGroupNoParamValidator.validate(params)
      const { since, nodeId } = await manifestsTrackerShareValidator.validate(request.qs())
      const data = await trackerShareService.listManifestSummaries(
        groupNo,
        {
          since: since ? Number(since) : undefined,
          nodeId: nodeId || undefined,
        }
      )
      log_tracker_info('manifest.list', {
        groupNo,
        since: since ? Number(since) : undefined,
        nodeId: nodeId || undefined,
        count: Array.isArray(data?.list) ? data.list.length : undefined,
      })
      return response.json({ code: 200, message: '', data })
    } catch (err: any) {
      log_tracker_error('manifest.list', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }

  /**
   * GET /tracker/group/:groupNo/manifest?nodeId=&shareType=&remoteMediaId=&remoteMangaId=
   * 拉取单个 manifest 的完整 payload
   */
  async manifest({ params, request, response }: HttpContext) {
    try {
      const { groupNo } = await trackerGroupNoParamValidator.validate(params)
      const { nodeId, shareType, remoteMediaId, remoteMangaId } =
        await manifestTrackerShareValidator.validate(request.qs())
      if (!nodeId || !shareType) throw new Error('nodeId 和 shareType 必填')

      const data = await trackerShareService.getManifestDetail(groupNo, {
        nodeId,
        shareType,
        remoteMediaId: remoteMediaId ? Number(remoteMediaId) : null,
        remoteMangaId: remoteMangaId ? Number(remoteMangaId) : null,
      })
      log_tracker_info('manifest.detail', {
        groupNo,
        nodeId,
        shareType,
        remoteMediaId: remoteMediaId ? Number(remoteMediaId) : null,
        remoteMangaId: remoteMangaId ? Number(remoteMangaId) : null,
      })
      return response.json({ code: 200, message: '', data })
    } catch (err: any) {
      log_tracker_error('manifest.detail', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }

  /**
   * GET /tracker/group/:groupNo/shares?page=&pageSize=&keyword=
   */
  async index({ params, request, response }: HttpContext) {
    try {
      const { groupNo } = await trackerGroupNoParamValidator.validate(params)
      const { page, pageSize, keyword } = await listTrackerShareValidator.validate(request.qs())
      const { list, count } = await trackerShareService.listGroupShares(groupNo, {
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        keyword,
      })
      log_tracker_info('share.list', {
        groupNo,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        keyword: keyword || undefined,
        count,
      })
      return response.json(
        { code: 200, message: '', list: list as any, count }
      )
    } catch (err: any) {
      log_tracker_error('share.list', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }
}
