import type { HttpContext } from '@adonisjs/core/http'
import { SResponse } from '../interfaces/response.js'
import { promises as fs } from 'fs'
import { join } from 'path'
import { path_config, get_config, sql_parse_json } from '#utils/index'
import { create_scan_cron } from '#services/cron_service'
import prisma from '#start/prisma'
import p2pIdentityService from '#services/p2p/p2p_identity_service'
import p2pHeartbeatService from '#services/p2p/p2p_heartbeat_service'

/**
 * 将各种语义的真假值统一为 0/1 数字(与现有 opds 字段保持一致风格)
 */
function to_bool_number(value: any): number {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0
}

/**
 * 将各种语义的真假值统一为布尔型(P2P 配置字段更习惯 true/false)
 */
function to_bool(value: any): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

export default class ConfigsController {
  public async get({ response }: HttpContext) {
    const config = get_config()
    const configResponse = new SResponse({ code: 0, message: '', data: config })
    return response.json(configResponse)
  }

  public async set({ request }: HttpContext) {
    const user = (request as any).user
    if (user.role !== 'admin') {
      return new SResponse({ code: 1, message: '无权限', status: 'error' })
    }
    const { key, value } = request.only(['key', 'value'])
    let config = get_config()

    if (key === 'scan.interval') {
      config.scan.interval = value
    }

    if (key === 'scan.mediaPosterInterval') {
      config.scan.mediaPosterInterval = value
    }

    if (key === 'sync.interval') {
      config.sync.interval = value
    }

    if (key === 'scan.auto') {
      config.scan.auto = value
    }

    if (key === 'scan.reloadCover') {
      config.scan.reloadCover = value
    }

    if (key === 'scan.doNotCopyCover') {
      config.scan.doNotCopyCover = value
    }

    if (key === 'scan.ignoreHiddenFiles') {
      config.scan.ignoreHiddenFiles = value
    }

    if (key === 'scan.createMediaPoster') {
      config.scan.createMediaPoster = value
    }

    if (key === 'compress.poster') {
      config.compress.poster = value
    }

    if (key === 'compress.bookmark') {
      config.compress.bookmark = value
    }

    if (key === 'compress.saveDuration') {
      config.compress.saveDuration = value
    }

    if (key === 'compress.sync') {
      config.compress.sync = value
    }

    if (key === 'compress.autoClear') {
      config.compress.autoClear = value
    }

    if (key === 'compress.clearCron') {
      config.compress.clearCron = value
    }

    if (key === 'compress.limit') {
      config.compress.limit = Number(value)
    }

    // OPDS 协议设置
    if (/^opds\./.test(key)) {
      if (!config.opds) {
        config.opds = { enabled: 1, pageSize: 30, baseUrl: '' }
      }
    }

    if (key === 'opds.enabled') {
      // 兼容 0/1 与 true/false
      config.opds.enabled = value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0
    }

    if (key === 'opds.pageSize') {
      const n = Number(value)
      config.opds.pageSize = Number.isFinite(n) && n > 0 ? n : 30
    }

    if (key === 'opds.baseUrl') {
      config.opds.baseUrl = String(value || '').trim()
    }

    // ===== P2P 协议设置 =====
    // 是否需要在写入后让节点用新身份/新 trackers 重新注册
    let needIdentityRefresh = false
    // 是否需要在写入后重启心跳服务(开关切换、间隔变更等)
    let needHeartbeatRestart = false

    if (/^p2p\./.test(key)) {
      // 兜底初始化,避免 smanga.json 旧版本里没有 p2p 节点
      if (!config.p2p) {
        config.p2p = {
          enable: false,
          role: { node: false, tracker: false },
          node: {
            nodeName: '',
            listenPort: 19798,
            publicHost: '',
            publicPort: 0,
            trackers: [],
            heartbeatInterval: 30,
          },
          tracker: {
            publicUrl: '',
            allowPublicRegister: true,
            requireInviteToRegister: false,
          },
        }
      }
      if (!config.p2p.role) config.p2p.role = { node: false, tracker: false }
      if (!config.p2p.node) config.p2p.node = {} as any
      if (!config.p2p.tracker) config.p2p.tracker = {} as any
    }

    if (key === 'p2p.enable') {
      config.p2p.enable = to_bool(value)
      needHeartbeatRestart = true
      // 重新打开 P2P 时,本地身份可能已过期/被清,触发一次重注册
      if (config.p2p.enable) needIdentityRefresh = true
    }

    if (key === 'p2p.role.node') {
      config.p2p.role.node = to_bool(value)
      needHeartbeatRestart = true
      needIdentityRefresh = true
    }

    if (key === 'p2p.role.tracker') {
      config.p2p.role.tracker = to_bool(value)
      // tracker 角色变更不直接影响节点身份,但会影响一体机自连兜底
      needIdentityRefresh = true
    }

    if (key === 'p2p.node.nodeName') {
      config.p2p.node.nodeName = String(value || '').trim()
      // nodeName 仅作为元数据展示,变更时下次心跳会随 publicHost 一起上报
    }

    if (key === 'p2p.node.publicHost') {
      const host = String(value || '').trim()
      config.p2p.node.publicHost = host
      needIdentityRefresh = true
    }

    if (key === 'p2p.node.publicPort') {
      const n = Number(value)
      config.p2p.node.publicPort = Number.isFinite(n) && n >= 0 ? n : 0
      needIdentityRefresh = true
    }

    if (key === 'p2p.node.listenPort') {
      const n = Number(value)
      // 仅写入配置,真正生效需要重启进程
      config.p2p.node.listenPort = Number.isFinite(n) && n > 0 ? n : 19798
    }

    if (key === 'p2p.node.heartbeatInterval') {
      const n = Number(value)
      config.p2p.node.heartbeatInterval = Number.isFinite(n) && n >= 10 ? n : 30
      needHeartbeatRestart = true
    }

    if (key === 'p2p.node.trackers') {
      // 允许传 string[] 或 JSON 字符串,统一规范化
      let list: string[] = []
      if (Array.isArray(value)) {
        list = value as string[]
      } else if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(trimmed)
            if (Array.isArray(parsed)) list = parsed as string[]
          } catch {
            list = []
          }
        } else if (trimmed) {
          // 兼容逗号/换行分隔
          list = trimmed.split(/[\s,]+/).filter(Boolean)
        }
      }
      list = list
        .map((u) => String(u || '').trim())
        .filter((u) => /^https?:\/\//i.test(u))
      config.p2p.node.trackers = list
      needIdentityRefresh = true
    }

    if (key === 'p2p.tracker.publicUrl') {
      config.p2p.tracker.publicUrl = String(value || '').trim()
    }

    if (key === 'p2p.tracker.allowPublicRegister') {
      config.p2p.tracker.allowPublicRegister = to_bool(value)
    }

    if (key === 'p2p.tracker.requireInviteToRegister') {
      config.p2p.tracker.requireInviteToRegister = to_bool(value)
    }
    // 兼容上面 to_bool_number 工具(当前未直接使用,保留以避免 lint 未使用警告)
    void to_bool_number

    // 检查并创建配置文件
    const configFile = join(path_config(), 'smanga.json')
    await fs.writeFile(configFile, JSON.stringify(config, null, 2))

    // 更改扫描相关设置后 重新创建扫描任务
    if (/scan/.test(key)) {
      create_scan_cron()
    }

    // P2P 配置变更后的副作用处理(写文件成功后再触发,避免脏状态)
    if (needIdentityRefresh && config.p2p?.enable && config.p2p?.role?.node) {
      // 异步执行,不阻塞接口返回;失败不影响配置写入
      p2pIdentityService
        .invalidateAndReregister()
        .then((id) => {
          console.log(`[p2p] 配置变更,节点已重新注册 nodeId=${id?.nodeId}`)
        })
        .catch((err: any) => {
          console.warn(`[p2p] 配置变更后重新注册失败: ${err?.message || err}`)
        })
    }
    if (needHeartbeatRestart) {
      p2pHeartbeatService
        .restart()
        .then(() => {
          console.log('[p2p] 配置变更,心跳服务已重启')
        })
        .catch((err: any) => {
          console.warn(`[p2p] 心跳服务重启失败: ${err?.message || err}`)
        })
    }

    const configResponse = new SResponse({ code: 0, message: '设置成功', data: config })
    return configResponse
  }

  public async user_config({ request, response }: HttpContext) {
    const userId = (request as any).userId
    const { userConfig } = request.only([
      'userConfig',
    ])
    const user = await prisma.user.update({
      where: { userId },
      data: {
        // @ts-ignore
        userConfig: sql_parse_json(userConfig),
      },
    })

    // 更新失败报错
    if (!user) {
      return response.json(new SResponse({ code: 1, message: '更新失败' }))
    }

    const updateResponse = new SResponse({ code: 0, message: '更新成功', data: user })
    return response.json(updateResponse)
  }
}
