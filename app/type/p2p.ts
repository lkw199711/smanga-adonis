// P2P 与 Tracker 共用类型定义

// ============ 角色枚举 ============
export enum P2PRole {
  node = 'node',
  tracker = 'tracker',
}

// ============ 群组成员角色 ============
export enum MemberRole {
  owner = 'owner',
  admin = 'admin',
  member = 'member',
}

// ============ 分享类型 ============
export enum ShareType {
  media = 'media',
  manga = 'manga',
}

// ============ 传输任务类型 ============
export enum TransferType {
  media = 'media',
  manga = 'manga',
  chapter = 'chapter',
}

// ============ 传输任务状态 ============
export enum TransferStatus {
  pending = 'pending',
  running = 'running',
  success = 'success',
  failed = 'failed',
  canceled = 'canceled',
}

// ============ 连接模式 ============
export enum ConnectMode {
  directPublic = 'direct-public',
  directLan = 'direct-lan',
  relay = 'relay',
  p2pWebrtc = 'p2p-webrtc',
}

// ============ 配置对象类型 ============
export type P2PNodeConfig = {
  nodeId: string
  nodeToken: string
  nodeName: string
  listenPort: number
  /**
   * 节点对外可达 URL(统一字段,替代旧的 publicHost + publicPort)
   * 支持格式:
   *   "example.com"
   *   "example.com:9798"
   *   "http://example.com:9798"
   *   "https://example.com"
   *   "1.2.3.4:9798"
   * 留空表示未配置(由 tracker 端 request.ip() 推断)
   */
  publicUrl: string
  trackers: string[]
  heartbeatInterval: number
  announceInterval: number
  allowLan: boolean
  lanHost: string
  lanPort: number
  maxConcurrentPulls: number
  maxConcurrentServes: number
  maxUploadKbps: number
  maxDownloadKbps: number
  defaultReceivedPath: string
  autoPullOnNewShare: boolean
}

export type P2PTrackerConfig = {
  publicUrl: string
  listenPort: number
  allowPublicRegister: boolean
  requireInviteToRegister: boolean
  maxNodes: number
  maxGroupsPerNode: number
  maxMembersPerGroup: number
  offlineThresholdSec: number
  cleanupCron: string
  adminNodeIds: string[]
}

export type P2PConfig = {
  enable: boolean
  role: {
    node: boolean
    tracker: boolean
  }
  node: P2PNodeConfig
  tracker: P2PTrackerConfig
}

// ============ Tracker 请求/响应载荷 ============
export type NodeRegisterPayload = {
  nodeName?: string
  version?: string
  /**
   * 节点对外可达 URL(必填)
   * 由节点自报,tracker 直接用此 URL 做反向可达性验证 + 写库
   * 用户填什么 tracker 就用什么(自动补 http:// 与去尾斜杠之外不做拆分)
   */
  publicUrl?: string
  inviteCode?: string
}

export type NodeRegisterResult = {
  nodeId: string
  nodeToken: string
  /** tracker 入库的 publicUrl(本机 loopback 注册时为空) */
  publicUrl: string
}

export type HeartbeatPayload = {
  /** 节点对外可达 URL,通常与注册时一致;允许变更(例如公网 IP 漂移) */
  publicUrl?: string
}

export type HeartbeatResult = {
  publicUrl: string
  serverTime: number
  pendingNotifications: Array<{ type: string; data?: any }>
}

export type CreateGroupPayload = {
  groupName: string
  describe?: string
  password?: string
  maxMembers?: number
}

export type JoinGroupPayload = {
  groupNo: string
  password?: string
  inviteCode?: string
}

export type AnnouncePayload = {
  shares: Array<{
    shareType: ShareType | string
    remoteMediaId?: number
    remoteMangaId?: number
    shareName: string
    coverUrl?: string
    mangaCount?: number
    totalSize?: number
    /**
     * 共享清单(可选,有变化时上报)
     * tracker 端接收到后会写入 tracker_share_manifest,
     * 并生成时间戳 version 返回给节点
     */
    manifest?: {
      contentHash: string
      payloadSize: number
      payloadTruncated: number
      payload: string // 序列化后的 JSON 字符串
    }
  }>
}

/** announce 响应:tracker 端返回每个 share 最新的 version */
export type AnnounceResult = {
  shares: Array<{
    shareType: string
    remoteMediaId?: number | null
    remoteMangaId?: number | null
    /** 该 share 在 tracker 端的最新 version(毫秒时间戳) */
    version: number
    /** 该 share 当前 contentHash(若上报时未变化,这里是 tracker 已存的旧 hash) */
    contentHash: string
  }>
}

// ============ P2P 节点对节点请求上下文 ============
export type P2PRequestContext = {
  callerNodeId: string
  groupNo: string
  timestamp: number
  signature: string
}