/**
 * P2P 群组对账服务
 *
 * 职责:以 tracker 端为权威,清理本地"幽灵群组"(tracker 已删除但本地仍存在)
 *
 * 触发场景:
 *  1. 用户手动 refresh
 *  2. 心跳服务定期对账(reconcileIntervalTicks 配合心跳节拍)
 *  3. 拉取任务过程中遇到 401/404/"群组不存在/已停用" 错误
 *
 * 一致性策略:tracker 视图为准
 *  - tracker 返回的群组 → upsert 进 p2p_group
 *  - tracker 未返回但本地有 → 视为已被解散/被踢出 → 级联清理
 *
 * 级联清理顺序(避免外键约束失败):
 *   p2p_local_share → p2p_peer_cache → p2p_transfer → p2p_group
 */

import prisma from '#start/prisma'
import TrackerClient from './tracker_client.js'
import p2pIdentityService from './p2p_identity_service.js'
import { get_config } from '#utils/index'
import { log_p2p_error } from '#utils/p2p_log'

/** 移除报告:列出在本次对账中被清理掉的群组 */
export type RemovedGroupInfo = {
  groupNo: string
  groupName: string
  removedShares: number
  removedPeers: number
  removedTransfers: number
}

export type ReconcileResult = {
  /** tracker 返回的群组数(若调用失败为 -1) */
  remoteCount: number
  /** 本次新增/更新到本地的群组数 */
  upserted: number
  /** 被清理掉的本地孤儿群 */
  removed: RemovedGroupInfo[]
  /** 是否真正完成 tracker 同步(失败时本地不会做删除,避免 tracker 临时不可达误删) */
  ok: boolean
  /** 错误信息(仅 ok=false 时有意义) */
  error?: string
}

/**
 * 级联清理一个本地群组(及其外键挂靠的所有数据)
 *
 * 注意:不调 tracker,仅本地清理。tracker 侧的退出/解散需要由调用方决定。
 *
 * @returns 各表删除条数;若群组不存在返回全 0
 */
export async function purgeLocalGroupByGroupNo(groupNo: string): Promise<{
  groupName: string
  removedShares: number
  removedPeers: number
  removedTransfers: number
  groupExisted: boolean
}> {
  const local = await prisma.p2p_group.findUnique({ where: { groupNo } })
  if (!local) {
    return {
      groupName: '',
      removedShares: 0,
      removedPeers: 0,
      removedTransfers: 0,
      groupExisted: false,
    }
  }
  const [shares, peers, transfers] = await Promise.all([
    prisma.p2p_local_share.deleteMany({ where: { p2pGroupId: local.p2pGroupId } }),
    prisma.p2p_peer_cache.deleteMany({ where: { p2pGroupId: local.p2pGroupId } }),
    prisma.p2p_transfer.deleteMany({ where: { p2pGroupId: local.p2pGroupId } }),
  ])
  await prisma.p2p_group.delete({ where: { p2pGroupId: local.p2pGroupId } })
  return {
    groupName: local.groupName,
    removedShares: shares.count,
    removedPeers: peers.count,
    removedTransfers: transfers.count,
    groupExisted: true,
  }
}

/**
 * 构建一个用于对账的 TrackerClient(带本节点凭证)
 */
function buildClient(): TrackerClient | null {
  const cfg = get_config()?.p2p
  if (!cfg?.enable || !cfg?.role?.node) return null

  const id = p2pIdentityService.getIdentity()
  if (!id) return null

  const url = p2pIdentityService.pickTrackerUrl(cfg)
  if (!url) return null

  return new TrackerClient(url, id.nodeId, id.nodeToken)
}

/**
 * 完整对账:拉取 tracker 群列表,upsert 本地新群,清理孤儿群
 *
 * 错误策略:
 *  - tracker 调用失败:不做任何清理(避免误删),返回 ok=false
 *  - 单个群清理失败:吞错继续,留待下次对账
 */
export async function reconcileGroupsWithTracker(): Promise<ReconcileResult> {
  const client = buildClient()
  if (!client) {
    return { remoteCount: -1, upserted: 0, removed: [], ok: false, error: 'P2P 未启用或身份未就绪' }
  }

  const cfg = get_config()?.p2p
  const id = p2pIdentityService.getIdentity()
  if (!id) {
    return { remoteCount: -1, upserted: 0, removed: [], ok: false, error: '本节点身份未就绪' }
  }

  let remoteGroups: any[] = []
  try {
    remoteGroups = await client.myGroups()
  } catch (e: any) {
    log_p2p_error('group.reconcile.fetch', e)
    return {
      remoteCount: -1,
      upserted: 0,
      removed: [],
      ok: false,
      error: e?.response?.data?.message || e?.message || 'tracker 同步失败',
    }
  }

  const remoteSet = new Set<string>()
  let upserted = 0
  for (const rg of remoteGroups || []) {
    if (!rg?.groupNo) continue
    remoteSet.add(rg.groupNo)
    const isSelfOwner = rg.role === 'owner'
    const ownerNodeId: string = rg.ownerNodeId || (isSelfOwner ? id.nodeId : '')
    const isOwner = ownerNodeId === id.nodeId ? 1 : 0
    try {
      await prisma.p2p_group.upsert({
        where: { groupNo: rg.groupNo },
        update: {
          groupName: rg.groupName,
          describe: rg.describe || null,
          ownerNodeId,
          isOwner,
          memberCount: rg.memberCount || 0,
          lastSyncTime: new Date(),
        },
        create: {
          groupNo: rg.groupNo,
          groupName: rg.groupName,
          describe: rg.describe || null,
          ownerNodeId,
          isOwner,
          trackerUrl: p2pIdentityService.pickTrackerUrl(cfg) || '',
          memberCount: rg.memberCount || 0,
        },
      })
      upserted += 1
    } catch (e: any) {
      log_p2p_error(`group.reconcile.upsert(${rg.groupNo})`, e)
    }
  }

  // 找出本地有但 tracker 没有的 → 孤儿群,级联清理
  const localGroups = await prisma.p2p_group.findMany({
    select: { p2pGroupId: true, groupNo: true, groupName: true },
  })
  const orphans = localGroups.filter((g) => !remoteSet.has(g.groupNo))

  const removed: RemovedGroupInfo[] = []
  for (const orphan of orphans) {
    try {
      const r = await purgeLocalGroupByGroupNo(orphan.groupNo)
      if (r.groupExisted) {
        removed.push({
          groupNo: orphan.groupNo,
          groupName: r.groupName,
          removedShares: r.removedShares,
          removedPeers: r.removedPeers,
          removedTransfers: r.removedTransfers,
        })
        console.log(
          `[p2p] 对账清理孤儿群: ${orphan.groupName}(${orphan.groupNo}) ` +
          `共享=${r.removedShares} peer=${r.removedPeers} transfer=${r.removedTransfers}`
        )
      }
    } catch (e: any) {
      log_p2p_error(`group.reconcile.purge(${orphan.groupNo})`, e)
    }
  }

  return {
    remoteCount: remoteGroups.length,
    upserted,
    removed,
    ok: true,
  }
}

/**
 * 单群对账兜底:用于 "拉取/上报时收到群组不存在错误" 的场景
 *
 * 调用方传入 groupNo,本函数主动到 tracker 验证 → 不存在则就地清理本地数据。
 * 失败/不可达均返回 false,不做误删。
 */
export async function reconcileSingleGroupIfMissing(groupNo: string): Promise<boolean> {
  const client = buildClient()
  if (!client) return false
  try {
    const myGroups: any[] = await client.myGroups()
    const stillExist = (myGroups || []).some((g) => g?.groupNo === groupNo)
    if (stillExist) return false
    const r = await purgeLocalGroupByGroupNo(groupNo)
    if (r.groupExisted) {
      console.log(
        `[p2p] 单群对账清理: ${r.groupName}(${groupNo}) ` +
        `共享=${r.removedShares} peer=${r.removedPeers} transfer=${r.removedTransfers}`
      )
      return true
    }
    return false
  } catch (e: any) {
    log_p2p_error(`group.reconcile.single(${groupNo})`, e)
    return false
  }
}