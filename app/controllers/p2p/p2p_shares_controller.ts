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
import { get_config } from '#utils/index'
import TrackerClient from '#services/p2p/tracker_client'
import p2pIdentityService from '#services/p2p/p2p_identity_service'
import { log_p2p_error, log_p2p_info } from '#utils/p2p_log'
import type { AnnouncePayload, AnnounceResult } from '#type/p2p'
import { buildShareManifest } from '#services/p2p/manifest/manifest_builder'
import {
  listP2PShareQueryValidator,
  createP2PShareValidator,
  updateP2PShareValidator,
  announceP2PShareValidator,
  idParamP2PValidator,
} from '#validators/p2p'

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
 *
 * 升级版(支持共享清单 manifest):
 *  1. 对每个 share 调用 buildShareManifest 生成 manifest
 *  2. 与 p2p_local_share_manifest 缓存的 contentHash 比对,变化才把 manifest 塞进 payload
 *  3. announce 成功后,用 tracker 返回的 version 回写 p2p_local_share_manifest 缓存
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

    // 预先查出所有现存 manifest 缓存(按 p2pLocalShareId 索引)
    const localShareIds = shares.map((s) => s.p2pLocalShareId)
    const cachedManifests = localShareIds.length
      ? await prisma.p2p_local_share_manifest.findMany({
          where: { p2pLocalShareId: { in: localShareIds } },
        })
      : []
    const cacheByShareId = new Map(cachedManifests.map((m) => [m.p2pLocalShareId, m]))

    type BuiltShare = {
      share: typeof shares[number]
      mangaCount: number | undefined
      manifest: Awaited<ReturnType<typeof buildShareManifest>>
      changed: boolean
    }

    const built: BuiltShare[] = await Promise.all(
      shares.map(async (s): Promise<BuiltShare> => {
        let mangaCount: number | undefined
        if (s.shareType === 'media' && s.mediaId) {
          mangaCount = await prisma.manga.count({ where: { mediaId: s.mediaId } })
        }

        const manifest = await buildShareManifest({
          p2pLocalShareId: s.p2pLocalShareId,
          shareType: s.shareType,
          mediaId: s.mediaId,
          mangaId: s.mangaId,
          shareName: s.shareName,
        })

        let changed = false
        if (manifest) {
          const cached = cacheByShareId.get(s.p2pLocalShareId)
          changed = !cached || cached.contentHash !== manifest.contentHash
        }

        return { share: s, mangaCount, manifest, changed }
      })
    )

    // 组装 announce payload
    const payload: AnnouncePayload = {
      shares: built.map(({ share: s, mangaCount, manifest, changed }) => {
        const item: AnnouncePayload['shares'][number] = {
          shareType: s.shareType,
          remoteMediaId: s.mediaId || undefined,
          remoteMangaId: s.mangaId || undefined,
          shareName: s.shareName,
          mangaCount,
        }
        // 仅当 manifest 生成成功且 hash 变化才上报(节省带宽)
        if (manifest && changed) {
          item.coverUrl = manifest.payload.share.coverUrl || undefined
          item.totalSize = manifest.payload.stats.totalSize
          item.manifest = {
            contentHash: manifest.contentHash,
            payloadSize: manifest.payloadSize,
            payloadTruncated: manifest.payloadTruncated ? 1 : 0,
            payload: manifest.payloadJson,
          }
        }
        return item
      }),
    }

    const result = (await client.announceShares(groupNo, payload)) as AnnounceResult | undefined

    // 把 tracker 返回的 version 回写到本地 manifest 缓存
    //   - 只有当本次 manifest 生成成功且 changed 时才需要更新缓存
    //   - 老的 tracker 不返回 result.shares,这种情况下用客户端时间戳作降级 version
    const versionByKey = new Map<string, { version: number; contentHash: string }>()
    if (result && Array.isArray(result.shares)) {
      for (const r of result.shares) {
        const k = `${r.shareType}|${r.remoteMediaId ?? ''}|${r.remoteMangaId ?? ''}`
        versionByKey.set(k, { version: Number(r.version), contentHash: r.contentHash })
      }
    }

    for (const { share: s, manifest, changed } of built) {
      if (!manifest || !changed) continue
      const key = `${s.shareType}|${s.mediaId ?? ''}|${s.mangaId ?? ''}`
      const fromTracker = versionByKey.get(key)
      const version = BigInt(fromTracker?.version || Date.now())
      const contentHash = fromTracker?.contentHash || manifest.contentHash

      await prisma.p2p_local_share_manifest.upsert({
        where: { p2pLocalShareId: s.p2pLocalShareId },
        create: {
          p2pLocalShareId: s.p2pLocalShareId,
          version,
          contentHash,
          payloadSize: manifest.payloadSize,
          payloadTruncated: manifest.payloadTruncated ? 1 : 0,
          payload: manifest.payloadJson,
          lastAnnounceTime: new Date(),
        },
        update: {
          version,
          contentHash,
          payloadSize: manifest.payloadSize,
          payloadTruncated: manifest.payloadTruncated ? 1 : 0,
          payload: manifest.payloadJson,
          lastAnnounceTime: new Date(),
        },
      })
    }
  } catch (e: any) {
    log_p2p_error('share.announce(后台异步)', e)
  }
}

export default class P2PSharesController {
  /**
   * GET /api/p2p/share?groupNo=xxx&page=&pageSize=
   *
   * 返回字段在原表基础上补充:
   *   - groupName / groupNo (来自 p2p_group)
   *   - mediaName / mangaName (从本地 media / manga 查询)
   */
  async index({ request, response }: HttpContext) {
    const { groupNo, page, pageSize } = await listP2PShareQueryValidator.validate(request.qs())
    let where: any = {}
    if (groupNo) {
      const g = await prisma.p2p_group.findUnique({ where: { groupNo } })
      if (!g) {
        return response.json({ code: 200, message: '', list: [], count: 0 })
      }
      where.p2pGroupId = g.p2pGroupId
    }

    const queryParams: any = {
      where,
      orderBy: { createTime: 'desc' },
      include: {
        group: {
          select: { p2pGroupId: true, groupNo: true, groupName: true },
        },
      },
    }
    if (page && pageSize) {
      queryParams.skip = (Number(page) - 1) * Number(pageSize)
      queryParams.take = Number(pageSize)
    }

    const list: any[] = await prisma.p2p_local_share.findMany(queryParams)
    const count = await prisma.p2p_local_share.count({ where })

    // 收集需要查询名称的 mediaId / mangaId
    const mediaIds = Array.from(
      new Set(list.map((s: any) => s.mediaId).filter((v): v is number => !!v))
    )
    const mangaIds = Array.from(
      new Set(list.map((s: any) => s.mangaId).filter((v): v is number => !!v))
    )

    const [mediaRows, mangaRows] = await Promise.all([
      mediaIds.length
        ? prisma.media.findMany({
            where: { mediaId: { in: mediaIds } },
            select: { mediaId: true, mediaName: true },
          })
        : Promise.resolve([] as { mediaId: number; mediaName: string }[]),
      mangaIds.length
        ? prisma.manga.findMany({
            where: { mangaId: { in: mangaIds } },
            select: { mangaId: true, mangaName: true, mediaId: true },
          })
        : Promise.resolve([] as { mangaId: number; mangaName: string; mediaId: number }[]),
    ])

    const mediaMap = new Map(mediaRows.map((m) => [m.mediaId, m.mediaName]))
    const mangaMap = new Map(mangaRows.map((m) => [m.mangaId, m]))

    const enriched = list.map((s: any) => {
      const groupName = s.group?.groupName || ''
      const groupNoVal = s.group?.groupNo || ''
      let mediaName = ''
      let mangaName = ''
      if (s.mediaId && mediaMap.has(s.mediaId)) {
        mediaName = mediaMap.get(s.mediaId) || ''
      }
      if (s.mangaId && mangaMap.has(s.mangaId)) {
        const mg = mangaMap.get(s.mangaId)!
        mangaName = mg.mangaName
        // 漫画类型分享:补充媒体库名
        if (!mediaName && mg.mediaId && mediaMap.has(mg.mediaId)) {
          mediaName = mediaMap.get(mg.mediaId) || ''
        }
      }
      return {
        ...s,
        groupName,
        groupNo: groupNoVal,
        mediaName,
        mangaName,
      }
    })

    return response.json({ code: 200, message: '', list: enriched, count })
  }

  /**
   * POST /api/p2p/share/create
   * body: { groupNo, shareType('media'|'manga'), mediaId?, mangaId?, shareName? }
   *
   * shareName 缺省时自动用对应 media / manga 的名字。
   */
  async create({ request, response }: HttpContext) {
    const { groupNo, shareType, mediaId, mangaId, shareName } =
      await createP2PShareValidator.validate(request.all())

    const group = await prisma.p2p_group.findUnique({ where: { groupNo } })
    if (!group) {
      return response.status(400).json({ code: 400, message: '群组不存在' })
    }

    if (shareType !== 'media' && shareType !== 'manga') {
      return response.status(400).json({ code: 400, message: 'shareType must be media or manga' })
    }
    if (shareType === 'media' && !mediaId) {
      return response.status(400).json({ code: 400, message: 'mediaId required' })
    }
    if (shareType === 'manga' && !mangaId) {
      return response.status(400).json({ code: 400, message: 'mangaId required' })
    }

    // 自动推导 shareName
    let resolvedShareName = shareName ? String(shareName).trim() : ''
    try {
      if (!resolvedShareName) {
        if (shareType === 'media') {
          const m = await prisma.media.findUnique({ where: { mediaId: Number(mediaId) } })
          resolvedShareName = m?.mediaName || `media-${mediaId}`
        } else {
          const m = await prisma.manga.findUnique({ where: { mangaId: Number(mangaId) } })
          resolvedShareName = m?.mangaName || `manga-${mangaId}`
        }
      }
    } catch (e: any) {
      log_p2p_error('share.create.resolveName', e)
      resolvedShareName = shareType === 'media' ? `media-${mediaId}` : `manga-${mangaId}`
    }

    try {
      const item = await prisma.p2p_local_share.create({
        data: {
          p2pGroupId: group.p2pGroupId,
          shareType,
          mediaId: mediaId ? Number(mediaId) : null,
          mangaId: mangaId ? Number(mangaId) : null,
          shareName: resolvedShareName,
          enable: 1,
        },
      })

      // 异步上报
      announce_group(group.groupNo)

      log_p2p_info('share.create', {
        p2pLocalShareId: item.p2pLocalShareId,
        groupNo: group.groupNo,
        shareType: item.shareType,
        mediaId: item.mediaId,
        mangaId: item.mangaId,
        enable: item.enable,
      })
      return response.json({ code: 200, message: '创建成功', data: item })
    } catch (e: any) {
      log_p2p_error('share.create', e)
      return response.status(500).json({ code: 500, message: e?.message || '创建失败' })
    }
  }

  /**
   * PUT /api/p2p/share/:id
   * body: { enable?, shareName? }
   */
  async update({ params, request, response }: HttpContext) {
    const { id } = await idParamP2PValidator.validate(params)
    const { enable, shareName } = await updateP2PShareValidator.validate(request.all())
    const existed = await prisma.p2p_local_share.findUnique({ where: { p2pLocalShareId: id } })
    if (!existed) {
      return response.status(404).json({ code: 404, message: 'not found' })
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

      log_p2p_info('share.update', {
        p2pLocalShareId: item.p2pLocalShareId,
        groupNo: group?.groupNo,
        enable: item.enable,
        shareName: item.shareName,
      })
      return response.json({ code: 200, message: '更新成功', data: item })
    } catch (e: any) {
      log_p2p_error('share.update', e)
      return response.status(500).json({ code: 500, message: e?.message || '更新失败' })
    }
  }

  /**
   * DELETE /api/p2p/share/:id
   */
  async destroy({ params, response }: HttpContext) {
    const { id } = await idParamP2PValidator.validate(params)
    const existed = await prisma.p2p_local_share.findUnique({ where: { p2pLocalShareId: id } })
    if (!existed) {
      return response.status(404).json({ code: 404, message: 'not found' })
    }
    try {
      // 先清理关联的 manifest 缓存(无外键级联,需手动)
      await prisma.p2p_local_share_manifest.deleteMany({
        where: { p2pLocalShareId: id },
      })
      await prisma.p2p_local_share.delete({ where: { p2pLocalShareId: id } })

      const group = await prisma.p2p_group.findUnique({ where: { p2pGroupId: existed.p2pGroupId } })
      if (group) announce_group(group.groupNo)

      log_p2p_info('share.destroy', {
        p2pLocalShareId: id,
        groupNo: group?.groupNo,
        shareType: existed.shareType,
        mediaId: existed.mediaId,
        mangaId: existed.mangaId,
      })
      return response.json({ code: 200, message: '删除成功' })
    } catch (e: any) {
      log_p2p_error('share.destroy', e)
      return response.status(500).json({ code: 500, message: e?.message || '删除失败' })
    }
  }

  /**
   * POST /api/p2p/share/announce
   * body: { groupNo }
   * 手动触发一次索引上报
   */
  async announce({ request, response }: HttpContext) {
    const { groupNo } = await announceP2PShareValidator.validate(request.all())
    await announce_group(groupNo)
    log_p2p_info('share.announce', { groupNo, trigger: 'manual' })
    return response.json({ code: 200, message: '已触发上报' })
  }
}
