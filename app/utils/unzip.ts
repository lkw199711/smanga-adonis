/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-04 00:12:16
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-11 02:01:33
 * @FilePath: \smanga-adonis\app\utils\unzip.ts
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')
const unzipper = require('unzipper')
import { is_img } from './index.js'

export function unzipFile(zipFilePath: string, outputDir: string) {
  const zip = new AdmZip(zipFilePath)
  zip.extractAllTo(outputDir, true)
}

// unzipFile('path/to/file.zip', 'output/directory')

export async function extractFirstImageSync(
  zipFilePath: string,
  outputFilePath: string
): Promise<boolean> {
  try {
    const zip = fs.readFileSync(zipFilePath)
    const directory = await unzipper.Open.buffer(zip)
    let imageFound = false

    directory.files.forEach(async (file: any) => {
      if (imageFound) return

      // const ext = path.extname(file.path).toLowerCase()

      if (file.type === 'File' && is_img(file.path)) {
        imageFound = true
        const outputDirPath = path.dirname(outputFilePath)

        if (!fs.existsSync(outputDirPath)) {
          fs.mkdirSync(outputDirPath, { recursive: true })
        }
        console.log('file:', file)

        const content = await file.buffer()
        fs.writeFileSync(outputFilePath, content)
      }
    })

    return imageFound
  } catch (error) {
    console.error('Error extracting image:', error)
    return false
  }
}

export async function extractFirstImageSyncOrder(
  zipFilePath: string,
  outputFilePath: string
): Promise<boolean> {
  try {
    const zip = fs.readFileSync(zipFilePath)
    const directory = await unzipper.Open.buffer(zip)
    let imgs: any = directory.files.filter((file: any) => {
      return file.type === 'File' && is_img(file.path)
    })

    if (imgs.length === 0) return false

    imgs.sort((a: any, b: any) => a.path.localeCompare(b.path))

    const content = await imgs[0].buffer()
    fs.writeFileSync(outputFilePath, content)

    return true
  } catch (error) {
    console.error('Error extracting image:', error)
    return false
  }
}