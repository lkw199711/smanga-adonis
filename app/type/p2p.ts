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
   * 节点对外可达 URL(合并 publicHost + publicPort)
   * 由节点自报;不传时 tracker 用 request.ip() 推断 host,端口取 localPort
   */
  publicUrl?: string
  localHost?: string
  localPort?: number
  inviteCode?: string
}

export type NodeRegisterResult = {
  nodeId: string
  nodeToken: string
  /** tracker 最终采纳的 publicUrl(可能是节点自报,也可能是 tracker 根据 request.ip 推断) */
  publicUrl: string
}

export type HeartbeatPayload = {
  /** 节点对外可达 URL,通常与注册时一致;允许变更(例如公网 IP 漂移) */
  publicUrl?: string
  localHost?: string
  localPort?: number
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
  }>
}

// ============ P2P 节点对节点请求上下文 ============
export type P2PRequestContext = {
  callerNodeId: string
  groupNo: string
  timestamp: number
  signature: string
}