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

export function set_config(config: object) {
  if (platform === 'win32') {
    fs.writeFileSync('./data/config/smanga.json', JSON.stringify(config, null, 2), 'utf-8')
  } else if (platform === 'linux') {
    fs.writeFileSync('/data/config/smanga.json', JSON.stringify(config, null, 2), 'utf-8')
  } else {
    fs.writeFileSync('/data/config/smanga.json', JSON.stringify(config, null, 2), 'utf-8')
  }
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

  if (/createTime/i.test(order)) {
    return {
      createTime: sort,
    }
  }

  if (/updateTime/i.test(order)) {
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
  let parseVal = jsonVal
  let jsonStr = jsonVal
  if (typeof jsonVal === 'string') {
    parseVal = JSON.parse(jsonVal)
  }
  if (typeof jsonVal === 'object') {
    jsonStr = JSON.stringify(jsonVal)
  }

  if (config.sql.client === 'sqlite') {
    return jsonStr;
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

export function read_json(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

export function extract_numbers(str: string) {
  const numbers = str.match(/\d+/g);
  const joinedNumbersString = numbers?.join('');
  return joinedNumbersString ? parseInt(joinedNumbersString, 10) : 0;
}

// 定义支持的图片文件扩展名
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp']
export function image_files(dirPath: string, exclude: string | null | undefined = ''): string[] {
  let imagePaths: string[] = []

  // 读取目录下的所有文件和子目录
  const files: string[] = fs.readdirSync(dirPath)

  files.forEach((file: string) => {
    const filePath: string = path.join(dirPath, file)
    const stat: fs.Stats = fs.statSync(filePath)

    if (stat.isDirectory()) {
      // 如果是目录, 递归处理
      imagePaths = imagePaths.concat(image_files(filePath, exclude))
    } else if (imageExtensions.includes(path.extname(file).toLowerCase())) {
      // 如果是图片文件, 添加绝对路径到数组
      imagePaths.push(filePath)
    }
  })

  // 如果有排除规则，则过滤掉不符合规则的图片
  if (exclude) {
    imagePaths = imagePaths.filter((image: string) => !new RegExp(exclude).test(image))
  }

  return imagePaths
}

export function first_image(dir: string): string {
  if (!is_directory(dir)) return ''
  const files = fs.readdirSync(dir, { withFileTypes: true })

  // 优先查找文件名包含 cover 的图片
  const coverNameImg = files.find((file) => {
    return /cover/i.test(file.name) && is_img(file.name)
  })

  if (coverNameImg) {
    return path.join(dir, coverNameImg.name)
  }

  for (const file of files) {
    const fullPath = path.join(dir, file.name)

    if (file.isDirectory()) {
      // 递归遍历子目录
      const found = first_image(fullPath)
      if (found) return found
    } else if (file.isFile() && is_img(file.name)) {
      // 如果找到图片，返回路径
      return fullPath
    }
  }

  // 没有找到图片
  return ''
}

export function is_directory(filePath: string) {
  try {
    const stats = fs.statSync(filePath)
    return stats.isDirectory()
  } catch (err) {
    // 如果路径不存在或其他错误，返回 false
    // console.error('Error:', err)
    return false
  }
}

export const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP'];