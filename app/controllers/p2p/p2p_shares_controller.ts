/**
 * P2P 本地共享配置控制器(用户侧)
 *
 * 路径:/api/p2p/share/*
 * 管理本节点对 "哪个群组" 共享 "哪些媒体库/漫画"
 *
 * 操作成功后会自动调用 tracker.announceShares 上报索引
 */

import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { ListResponse, SResponse } from '#interfaces/response'
import { get_config } from '#utils/index'
import TrackerClient from '#services/p2p/tracker_client'
import p2pIdentityService from '#services/p2p/p2p_identity_service'
import { log_p2p_error } from '#utils/p2p_log'
import type { AnnouncePayload } from '#type/p2p'

function get_client(): TrackerClient | null {
  const cfg = get_config()?.p2p
  if (!cfg?.enable || !cfg?.role?.node) return null

  const id = p2pIdentityService.getIdentity()
  if (!id) return null

  const url = p2pIdentityService.pickTrackerUrl(cfg)
  if (!url) return null

  return new TrackerClient(url, id.nodeId, id.nodeToken)
}

/**
 * 根据本地 p2p_local_share 组装并上报到 tracker
 */
async function announce_group(groupNo: string) {
  try {
    const client = get_client()
    if (!client) return
    const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
    if (!group) return
    const shares = await prisma.p2p_local_share.findMany({
      where: { p2pGroupId: group.p2pGroupId, enable: 1 },
    })
    const payload: AnnouncePayload = {
      shares: await Promise.all(
        shares.map(async (s) => {
          let mangaCount: number | undefined
          if (s.shareType === 'media' && s.mediaId) {
            mangaCount = await prisma.manga.count({ where: { mediaId: s.mediaId } })
          }
          return {
            shareType: s.shareType,
            remoteMediaId: s.mediaId || undefined,
            remoteMangaId: s.mangaId || undefined,
            shareName: s.shareName,
            mangaCount,
          }
        })
      ),
    }
    await client.announceShares(groupNo, payload)
  } catch (e: any) {
    log_p2p_error('share.announce(后台异步)', e)
  }
}

export default class P2PSharesController {
  /**
   * GET /api/p2p/share?groupNo=xxx
   */
  async index({ request, response }: HttpContext) {
    const { groupNo } = request.only(['groupNo'])
    let where: any = {}
    if (groupNo) {
      const g = await prisma.p2p_group.findUnique({ where: { groupNo } })
      if (!g) {
        return response.json(new ListResponse({ code: 0, message: '', list: [], count: 0 }))
      }
      where.p2pGroupId = g.p2pGroupId
    }
    const list = await prisma.p2p_local_share.findMany({
      where,
      orderBy: { createTime: 'desc' },
    })
    return response.json(new ListResponse({ code: 0, message: '', list, count: list.length }))
  }

  /**
   * POST /api/p2p/share/create
   * body: { groupNo, shareType(media|manga), mediaId?, mangaId?, shareName }
   */
  async create({ request, response }: HttpContext) {
    const { groupNo, shareType, mediaId, mangaId, shareName } = request.only([
      'groupNo', 'shareType', 'mediaId', 'mangaId', 'shareName',
    ])

    const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
    if (!group) {
      return response.status(400).json(new SResponse({ code: 1, message: '群组不存在' }))
    }

    if (!shareName || !String(shareName).trim()) {
      return response.status(400).json(new SResponse({ code: 1, message: 'shareName required' }))
    }
    if (shareType !== 'media' && shareType !== 'manga') {
      return response.status(400).json(new SResponse({ code: 1, message: 'shareType must be media or manga' }))
    }
    if (shareType === 'media' && !mediaId) {
      return response.status(400).json(new SResponse({ code: 1, message: 'mediaId required' }))
    }
    if (shareType === 'manga' && !mangaId) {
      return response.status(400).json(new SResponse({ code: 1, message: 'mangaId required' }))
    }

    try {
      const item = await prisma.p2p_local_share.create({
        data: {
          p2pGroupId: group.p2pGroupId,
          shareType,
          mediaId: mediaId || null,
          mangaId: mangaId || null,
          shareName: String(shareName).trim(),
          enable: 1,
        },
      })

      // 异步上报
      announce_group(groupNo)

      return response.json(new SResponse({ code: 0, message: '创建成功', data: item }))
    } catch (e: any) {
      log_p2p_error('share.create', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || '创建失败' }))
    }
  }

  /**
   * PUT /api/p2p/share/:id
   * body: { enable?, shareName? }
   */
  async update({ params, request, response }: HttpContext) {
    const id = Number(params.id)
    const { enable, shareName } = request.only(['enable', 'shareName'])
    const existed = await prisma.p2p_local_share.findUnique({ where: { p2pLocalShareId: id } })
    if (!existed) {
      return response.status(404).json(new SResponse({ code: 1, message: 'not found' }))
    }
    try {
      const item = await prisma.p2p_local_share.update({
        where: { p2pLocalShareId: id },
        data: {
          ...(enable !== undefined && { enable }),
          ...(shareName !== undefined && { shareName }),
        },
      })

      const group = await prisma.p2p_group.findUnique({ where: { p2pGroupId: existed.p2pGroupId } })
      if (group) announce_group(group.groupNo)

      return response.json(new SResponse({ code: 0, message: '更新成功', data: item }))
    } catch (e: any) {
      log_p2p_error('share.update', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || '更新失败' }))
    }
  }

  /**
   * DELETE /api/p2p/share/:id
   */
  async destroy({ params, response }: HttpContext) {
    const id = Number(params.id)
    const existed = await prisma.p2p_local_share.findUnique({ where: { p2pLocalShareId: id } })
    if (!existed) {
      return response.status(404).json(new SResponse({ code: 1, message: 'not found' }))
    }
    try {
      await prisma.p2p_local_share.delete({ where: { p2pLocalShareId: id } })

      const group = await prisma.p2p_group.findUnique({ where: { p2pGroupId: existed.p2pGroupId } })
      if (group) announce_group(group.groupNo)

      return response.json(new SResponse({ code: 0, message: '删除成功' }))
    } catch (e: any) {
      log_p2p_error('share.destroy', e)
      return response.status(500).json(new SResponse({ code: 1, message: e?.message || '删除失败' }))
    }
  }

  /**
   * POST /api/p2p/share/announce
   * body: { groupNo }
   * 手动触发一次索引上报
   */
  async announce({ request, response }: HttpContext) {
    const { groupNo } = request.only(['groupNo'])
    if (!groupNo) {
      return response.status(400).json(new SResponse({ code: 1, message: 'groupNo required' }))
    }
    await announce_group(groupNo)
    return response.json(new SResponse({ code: 0, message: '已触发上报' }))
  }
}