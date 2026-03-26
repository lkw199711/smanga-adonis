import type { HttpContext } from '@adonisjs/core/http'
import { SResponse } from '../interfaces/response.js'
import { promises as fs } from 'fs'
import { join } from 'path'
import { path_config, get_config, sql_parse_json } from '#utils/index'
import { create_scan_cron } from '#services/cron_service'
import prisma from '#start/prisma'

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

    // 检查并创建配置文件
    const configFile = join(path_config(), 'smanga.json')
    await fs.writeFile(configFile, JSON.stringify(config, null, 2))

    // 更改扫描相关设置后 重新创建扫描任务
    if (/scan/.test(key)) {
      create_scan_cron()
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
