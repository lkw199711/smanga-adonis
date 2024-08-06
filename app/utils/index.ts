/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 14:13:00
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-06 00:10:29
 * @FilePath: \smanga-adonis\app\utils\index.ts
 */
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
const platform = os.platform()
// 获取当前运行路径作为根目录
const rootDir = process.cwd()

function get_os() {
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

export function path_poster() {
  if (platform === 'win32') {
    return path.join(rootDir, 'poster')
  } else {
    return ''
  }
}

export function path_compress() {
  if (platform === 'win32') {
    return path.join(rootDir, 'compress')
  } else {
    return ''
  }
}

export function get_config() {
  const rawData = fs.readFileSync(path.join(rootDir, 'smanga.json'), 'utf-8')
  const config = JSON.parse(rawData)
  return config
}

export function order_params(order: string = 'asc', model: string = 'chapter') {
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
