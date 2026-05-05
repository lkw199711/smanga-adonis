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
  publicHost: string
  publicPort: number
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
  /** 节点对外可达的 host(公网/反向代理域名),由节点自报;不传时 tracker 用 request.ip() */
  publicHost?: string
  /** 节点对外可达的 http 端口,由节点自报;通常等于 AdonisJS 监听端口 */
  publicPort?: number
  localHost?: string
  localPort?: number
  inviteCode?: string
}

export type NodeRegisterResult = {
  nodeId: string
  nodeToken: string
  publicHost: string
}

export type HeartbeatPayload = {
  publicHost?: string
  publicPort?: number
  localHost?: string
  localPort?: number
}

export type HeartbeatResult = {
  publicHost: string
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