import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')
const unzipper = require('unzipper')
import { first_archive_cover_or_image, is_archive_image } from './index.js'
import { parseStringPromise } from 'xml2js'

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
    const imgs: any = directory.files.filter((file: any) => {
      return file.type === 'File' && is_archive_image(file.path)
    })

    if (imgs.length === 0) return false
    const selectedImgPath = first_archive_cover_or_image(imgs.map((file: any) => file.path))
    const selectedImg = imgs.find((file: any) => file.path === selectedImgPath)
    if (!selectedImg) return false

    const outputDirPath = path.dirname(outputFilePath)

    if (!fs.existsSync(outputDirPath)) {
      fs.mkdirSync(outputDirPath, { recursive: true })
    }

    const content = await selectedImg.buffer()
    fs.writeFileSync(outputFilePath, content)

    return true
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
    const imgs: any = directory.files.filter((file: any) => {
      return file.type === 'File' && is_archive_image(file.path)
    })

    if (imgs.length === 0) return false

    const selectedImgPath = first_archive_cover_or_image(imgs.map((file: any) => file.path))
    const selectedImg = imgs.find((file: any) => file.path === selectedImgPath)
    if (!selectedImg) return false

    const content = await selectedImg.buffer()
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
  if (entries.length === 0) return false

  const firstImagePath = first_archive_cover_or_image(
    entries
      .filter((entry: any) => !entry.isDirectory)
      .map((entry: any) => entry.entryName || entry.name)
  )
  if (!firstImagePath) return false

  const coverEntry = entries.find((entry: any) => {
    return (entry.entryName || entry.name) === firstImagePath
  })
  if (!coverEntry) return false
  // outputDir 是文件则取其路径
  // const coverFileName = path.basename(outputDir)
  // outputDir = path.dirname(outputDir)
  // coverEntry.name = coverFileName;

  const buffer = zip.readFile(coverEntry)

  // zip.extractEntryTo(coverEntry, outputDir, true)
  fs.writeFileSync(outputDir, buffer)

  return true
}

export async function extract_metadata(zipFilePath: string, maxBytes = Number.POSITIVE_INFINITY) {
  const zip = new AdmZip(zipFilePath)
  const entries = zip.getEntries()
  if (entries.length === 0) return false

  let coverEntry = entries.find((entry: any) => entry.name === 'ComicInfo.xml')
  if (!coverEntry) return false
  if (Number(coverEntry.header?.size || 0) > maxBytes) return false

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
): Promise<{ coverPath: string | null; metadata: any }> {
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
    const imgs: any = directory.files.filter((file: any) => {
      return file.type === 'File' && is_archive_image(file.path)
    })

    if (imgs.length > 0) {
      const selectedImgPath = first_archive_cover_or_image(imgs.map((file: any) => file.path))
      const selectedImg = imgs.find((file: any) => file.path === selectedImgPath)
      if (!selectedImg) return { coverPath, metadata }

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
