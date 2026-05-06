/**
 * Tracker HTTP 客户端 SDK(节点侧使用)
 *
 * 封装对公网 Tracker 的所有 REST 调用:
 *  - 节点注册/心跳/更新/注销
 *  - 群组创建/加入/退出/列表/成员
 *  - 共享索引上报
 *
 * 所有请求会自动携带 X-Node-Id / X-Node-Token 头(除 register 外)
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { get_config } from '#utils/index'
import type {
  NodeRegisterPayload,
  NodeRegisterResult,
  HeartbeatPayload,
  HeartbeatResult,
  CreateGroupPayload,
  JoinGroupPayload,
  AnnouncePayload,
} from '#type/p2p'

export class TrackerClient {
  private baseUrl: string
  private http: AxiosInstance
  private nodeId?: string
  private nodeToken?: string

  constructor(baseUrl: string, nodeId?: string, nodeToken?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.nodeId = nodeId
    this.nodeToken = nodeToken
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 15 * 1000,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    })
  }

  /**
   * 使用当前节点凭证填充鉴权头
   */
  private auth(config: AxiosRequestConfig = {}): AxiosRequestConfig {
    config.headers = config.headers || {}
    if (this.nodeId) (config.headers as any)['X-Node-Id'] = this.nodeId
    if (this.nodeToken) (config.headers as any)['X-Node-Token'] = this.nodeToken
    return config
  }

  setCredentials(nodeId: string, nodeToken: string) {
    this.nodeId = nodeId
    this.nodeToken = nodeToken
  }

  // ============ Node ============
  async register(payload: NodeRegisterPayload): Promise<NodeRegisterResult> {
    const res = await this.http.post('/tracker/node/register', payload)
    return res.data?.data ?? res.data
  }

  async heartbeat(payload: HeartbeatPayload = {}): Promise<HeartbeatResult> {
    const res = await this.http.post('/tracker/node/heartbeat', payload, this.auth())
    return res.data?.data ?? res.data
  }

  async updateNode(data: { nodeName?: string }) {
    const res = await this.http.patch('/tracker/node/me', data, this.auth())
    return res.data?.data ?? res.data
  }

  async deregister() {
    const res = await this.http.delete('/tracker/node/me', this.auth())
    return res.data?.data ?? res.data
  }

  // ============ Group ============
  async createGroup(payload: CreateGroupPayload) {
    const res = await this.http.post('/tracker/group', payload, this.auth())
    return res.data?.data ?? res.data
  }

  async joinGroup(payload: JoinGroupPayload) {
    const res = await this.http.post('/tracker/group/join', payload, this.auth())
    return res.data?.data ?? res.data
  }

  async leaveGroup(groupNo: string) {
    const res = await this.http.post(`/tracker/group/${groupNo}/leave`, {}, this.auth())
    return res.data?.data ?? res.data
  }

  /**
   * 群主解散群组(tracker 端会校验调用者是否为群主)
   */
  async dismissGroup(groupNo: string) {
    const res = await this.http.delete(`/tracker/group/${groupNo}`, this.auth())
    return res.data?.data ?? res.data
  }

  async myGroups() {
    const res = await this.http.get('/tracker/group', this.auth())
    // 兼容 ListResponse { list, count } 与原始数组
    const data = res.data?.data ?? res.data
    return data?.list ?? data
  }

  async groupMembers(groupNo: string) {
    const res = await this.http.get(`/tracker/group/${groupNo}/members`, this.auth())
    const data = res.data?.data ?? res.data
    return data?.list ?? data
  }

  /**
   * 校验某节点是否为群组成员(供 P2P 同步接口 serve 端鉴权使用)
   *
   * 复用现有 /tracker/group/:groupNo/members 接口,
   * 返回 true / false;若 tracker 不可达或接口异常,**抛出异常**由调用方决定降级策略。
   *
   * 注意: 此处用当前节点的 X-Node-Token 去调 tracker,前提是当前节点已是该群成员,
   * 否则 tracker 会返回 404(群组不存在/未加入),此时我们认为 "无法判定" → 抛错。
   */
  async checkMembership(groupNo: string, targetNodeId: string): Promise<boolean> {
    const members = (await this.groupMembers(groupNo)) as Array<{ nodeId: string }>
    if (!Array.isArray(members)) {
      throw new Error('tracker 返回成员列表格式异常')
    }
    return members.some((m) => m && m.nodeId === targetNodeId)
  }

  async kickMember(groupNo: string, targetNodeId: string) {
    const res = await this.http.delete(
      `/tracker/group/${groupNo}/member/${targetNodeId}`,
      this.auth()
    )
    return res.data?.data ?? res.data
  }

  async createInvite(groupNo: string, expiresHours?: number) {
    const res = await this.http.post(
      `/tracker/group/${groupNo}/invite`,
      { expiresHours },
      this.auth()
    )
    return res.data?.data ?? res.data
  }

  // ============ Share ============
  async announceShares(groupNo: string, payload: AnnouncePayload) {
    const res = await this.http.post(
      `/tracker/group/${groupNo}/announce`,
      payload,
      this.auth()
    )
    return res.data?.data ?? res.data
  }

  async listShares(groupNo: string) {
    const res = await this.http.get(`/tracker/group/${groupNo}/shares`, this.auth())
    const data = res.data?.data ?? res.data
    return data?.list ?? data
  }

  /**
   * 按资源查询群内拥有该资源的节点(多源 P2P 拉取用)
   */
  async findSeeds(
    groupNo: string,
    params: {
      shareType: 'media' | 'manga' | 'chapter'
      remoteMediaId?: number
      remoteMangaId?: number
    }
  ) {
    const res = await this.http.get(
      `/tracker/group/${groupNo}/seeds`,
      this.auth({ params })
    )
    const data = res.data?.data ?? res.data
    return (data?.list ?? data) as Array<{
      nodeId: string
      nodeName: string | null
      online: number
      publicHost: string | null
      publicPort: number | null
      localHost: string | null
      localPort: number | null
      lastHeartbeat: string | null
      shareName: string
    }>
  }
}

/**
 * 根据配置选择 "首选 tracker" 生成一个默认客户端(若未配置返回 null)
 */
export function get_default_tracker_client(): TrackerClient | null {
  const cfg = get_config()?.p2p
  if (!cfg?.enable || !cfg?.role?.node) return null

  const trackers: string[] = cfg?.node?.trackers || []
  if (!trackers.length) return null

  // 如果本机同时是 tracker 且 publicUrl 为空,则默认连回自身 listenPort
  // 这里简单取第一个
  return new TrackerClient(trackers[0], cfg.node?.nodeId, cfg.node?.nodeToken)
}

export default TrackerClient