/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 14:13:00
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-02-14 18:02:05
 * @FilePath: \smanga-adonis\app\utils\index.ts
 */
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
// import { SortOrder } from
const platform = os.platform()
// 获取当前运行路径作为根目录
const rootDir = process.cwd()

export function get_os() {
  const platform = os.platform()
  if (platform === 'win32') {
    return 'Windows'
  } else if (platform === 'linux') {
    return 'Linux'
  } else {
    return 'Other'
  }
}
/**
 * 判断图片是否为图片格式
 * @param {string} file 文件路径
 * @returns
 */
export function is_img(file: string) {
  return /(.bmp|.jpg|.jpeg|.png|.tif|.gif|.pcx|.tga|.exif|.fpx|.svg|.psd|.cdr|.pcd|.dxf|.ufo|.eps|.ai|.raw|.WMF|.webp|.avif|.apng)$/i.test(
    file
  )
}

export function get_env() {
  return process.env.NODE_ENV
}

export function path_poster(): string {
  if (platform === 'win32') {
    return path.join(rootDir, 'data', 'poster')
  } else if (platform === 'linux') {
    return '/data/poster'
  } else {
    return '/data/poster'
  }
}

export function path_bookmark() {
  if (platform === 'win32') {
    return path.join(rootDir, 'data', 'bookmark')
  } else if (platform === 'linux') {
    return '/data/bookmark'
  } else {
    return '/data/bookmark'
  }
}

export function path_cache() {
  if (platform === 'win32') {
    return path.join(rootDir, 'data', 'cache')
  } else if (platform === 'linux') {
    return '/data/cache'
  } else {
    return '/data/cache'
  }
}

export function path_compress() {
  if (platform === 'win32') {
    return path.join(rootDir, 'data', 'compress')
  } else if (platform === 'linux') {
    return '/data/compress'
  } else {
    return '/data/compress'
  }
}

export function path_config() {
  if (platform === 'win32') {
    return path.join(rootDir, 'data', 'config')
  } else if (platform === 'linux') {
    return path.join('/', 'data', 'config')
  } else {
    return path.join('/', 'data', 'config')
  }
}

export function get_config() {
  let rawData = ''
  if (platform === 'win32') {
    rawData = fs.readFileSync('./data/config/smanga.json', 'utf-8')
  } else if (platform === 'linux') {
    rawData = fs.readFileSync('/data/config/smanga.json', 'utf-8')
  } else {
    rawData = fs.readFileSync('/data/config/smanga.json', 'utf-8')
  }
  const config = JSON.parse(rawData)
  return config
}

export function order_params(order: string = 'asc', model: string = 'chapter'): object {
  const sort = /desc/i.test(order) ? 'desc' : 'asc'

  if (/id/.test(order)) {
    const nameField = model === 'chapter' ? 'chapterId' : 'mangaId'
    return {
      [nameField]: sort,
    }
  }

  if (/number/i.test(order)) {
    const nameField = model === 'chapter' ? 'chapterNumber' : 'mangaNumber'
    return {
      [nameField]: sort,
    }
  }

  if (/name/i.test(order)) {
    const nameField = model === 'chapter' ? 'chapterName' : 'mangaName'
    return {
      [nameField]: sort,
    }
  }

  if (/time/i.test(order)) {
    return {
      updateTime: sort,
    }
  }

  return {}
}

/**
 * 将值转为可以使用的json
 * 因为sqlite不能直接存储json，所以需要转化为字符串
 * 当然，如果是mysql等数据库，可以直接存储json
 * @param jsonVal 目标json值
 * @returns
 */
export function sql_parse_json(jsonVal: string | object | number | true) {
  const config = get_config()
  let parseVal = null
  if (typeof jsonVal === 'string') {
    parseVal = JSON.parse(jsonVal)
  }

  if (config.sql.client === 'sqlite') {
    return jsonVal;
  } else {
    return parseVal
  }
}

export function s_delete(file: string) {
  try {
    fs.rmSync(file, { force: true, recursive: true })
  } catch (err) {
    console.error(err.message)
  }
}

export function write_log(logMessage: string) {
  const logFile = path.join(rootDir, 'data', 'logs', 'smanga.log')

  // 将日志内容同步写入文件，使用 '\n' 换行符
  try {
    fs.appendFileSync(logFile, logMessage + '\n')
    console.log('日志已成功写入')
  } catch (err) {
    console.error('写入日志时发生错误:', err)
  }
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
