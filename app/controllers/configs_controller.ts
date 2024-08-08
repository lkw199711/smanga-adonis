import type { HttpContext } from '@adonisjs/core/http'
import { get_config } from '../utils/index.js'
import { SResponse } from '../interfaces/response.js'
import { promises as fs } from 'fs'
import { join } from 'path'

export default class ConfigsController {
  public async get({ response }: HttpContext) {
    const config = get_config()
    const configResponse = new SResponse({ code: 0, message: '', data: config })
    return response.json(configResponse)
  }

  public async set({ request, response }: HttpContext) {
    const { key, value } = request.only(['key', 'value'])
    let config = get_config()

    if (key === 'scan.interval') {
      config.scan.interval = value
    }

    if (key === 'scan.auto') {
      config.scan.auto = value
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

    // 获取当前运行路径作为根目录
    const rootDir = process.cwd()
    // 检查并创建配置文件
    const configFile = join(rootDir, 'smanga.json')
    await fs.writeFile(configFile, JSON.stringify(config, null, 2))
  }
}
