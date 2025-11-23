import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')
const unzipper = require('unzipper')
import { is_img } from './index.js'
import { parseStringPromise } from 'xml2js'

export async function unzipFile(zipFilePath: string, outputDir: string) {
  // 使用Promise包装同步操作，并通过setImmediate避免阻塞主线程
  return new Promise<void>((resolve, reject) => {
    try {
      // 使用setImmediate将同步操作放入事件循环的下一个阶段
      setImmediate(() => {
        try {
          const zip = new AdmZip(zipFilePath)
          zip.extractAllTo(outputDir, true)
          resolve()
        } catch (error) {
          console.error('Unzip error:', error)
          reject(error)
        }
      })
    } catch (error) {
      console.error('Unzip setup error:', error)
      reject(error)
    }
  })
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

    const coverNameImg = imgs.find((file: any) => /cover/i.test(file.path))
    if (coverNameImg) {
      imgs = [coverNameImg]
    }

    imgs.sort((a: any, b: any) => a.path.localeCompare(b.path))

    const content = await imgs[0].buffer()
    fs.writeFileSync(outputFilePath, content)

    return true
  } catch (error) {
    console.error('Error extracting image:', error)
    return false
  }
}

export async function extract_cover(zipFilePath: string, outputDir: string) {
  const zip = new AdmZip(zipFilePath)
  const entries = zip.getEntries()
  if (entries.length === 0) return false;

  let coverEntry = entries.find((entry: any) => /cover/i.test(entry.name))
  if (!coverEntry) coverEntry = entries.find((entry: any) => is_img(entry.name))
  // outputDir 是文件则取其路径
  // const coverFileName = path.basename(outputDir)
  // outputDir = path.dirname(outputDir)
  // coverEntry.name = coverFileName;

  const buffer = zip.readFile(coverEntry)

  // zip.extractEntryTo(coverEntry, outputDir, true)
  fs.writeFileSync(outputDir, buffer)

  return true
}

export async function extract_metadata(zipFilePath: string) {
  const zip = new AdmZip(zipFilePath)
  const entries = zip.getEntries()
  if (entries.length === 0) return false;

  let coverEntry = entries.find((entry: any) => entry.name === 'ComicInfo.xml')
  if (!coverEntry) return false;

  const ComicInfo = zip.readAsText(coverEntry.name)
  const ComicInfoJson = await parseStringPromise(ComicInfo)

  return ComicInfoJson
}

/**
 * Extract cover image and metadata from a zip file
 * @param zipFilePath Path to the zip file
 * @param outputDir Directory to save the extracted cover image
 * @returns Object containing cover path and metadata
 */
export async function extractCoverAndMetadata(
  zipFilePath: string,
  outputDir: string
): Promise<{ coverPath: string | null, metadata: any }> {
  try {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const zip = fs.readFileSync(zipFilePath)
    const directory = await unzipper.Open.buffer(zip)
    let coverPath: string | null = null
    let metadata: any = {}

    // Find and extract cover image
    let imgs: any = directory.files.filter((file: any) => {
      return file.type === 'File' && is_img(file.path)
    })

    if (imgs.length > 0) {
      const coverNameImg = imgs.find((file: any) => /cover/i.test(file.path))
      let selectedImg = coverNameImg || imgs.sort((a: any, b: any) => a.path.localeCompare(b.path))[0]

      const coverFileName = path.basename(selectedImg.path)
      coverPath = path.join(outputDir, coverFileName)

      const content = await selectedImg.buffer()
      fs.writeFileSync(coverPath, content)
    }

    // Find and parse ComicInfo.xml
    const comicInfoFile = directory.files.find((file: any) => {
      return file.type === 'File' && path.basename(file.path).toLowerCase() === 'comicinfo.xml'
    })

    if (comicInfoFile) {
      const xmlContent = await comicInfoFile.buffer()
      metadata = await parseStringPromise(xmlContent.toString())
    }

    return { coverPath, metadata }
  } catch (error) {
    console.error('Error extracting cover and metadata:', error)
    return { coverPath: null, metadata: {} }
  }
}