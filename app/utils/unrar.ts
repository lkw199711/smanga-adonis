/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-04 01:24:52
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-13 19:25:34
 * @FilePath: \smanga-adonis\app\utils\unrar.cjs
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
import * as path from 'path'
import { is_img } from './index.js'
const unrar = require('node-unrar-js')

export async function extractRar(rarFilePath: string, outputDir: string) {
  const extractor = await unrar.createExtractorFromFile({
    filepath: rarFilePath,
    targetPath: outputDir,
  })

  const extractored: any = extractor.extract()

  const abc = [...extractored.files]

  return abc?.length > 0
}

export async function extractFirstImageFromRAROrder(
  rarFilePath: string,
  outputFile: string
): Promise<boolean> {
  const outputDir = path.dirname(outputFile)

  const extractor = await unrar.createExtractorFromFile({
    filepath: rarFilePath,
    targetPath: outputDir,
    filenameTransform: () => {
      return path.basename(outputFile)
    },
  })

  let first = false
  const extractored: any = extractor.extract({
    files: (fileHeader: any) => {
      console.log('fileHeader:', fileHeader)

      if (first) return false

      if (is_img(fileHeader.name)) {
        first = true
        return true
      }

      return false
    },
  })

  const abc = [...extractored.files]

  return abc?.length > 0
}

export class Unrar {
  private rarFilePath: string
  private outputDir: string

  constructor(rarFilePath: string, outputDir: string) {
    this.rarFilePath = rarFilePath
    this.outputDir = outputDir
  }

  public async extract_first_image_order(
    rarFilePath: string = this.rarFilePath,
    outputFile: string = this.outputDir
  ): Promise<boolean> {
    const outputDir = path.dirname(outputFile)

    const extractor = await unrar.createExtractorFromFile({
      filepath: rarFilePath,
      targetPath: outputDir,
      filenameTransform: () => {
        return path.basename(outputFile)
      },
    })

    let first = false
    const extractored: any = extractor.extract({
      files: (fileHeader: any) => {
        if (first) return false

        if (is_img(fileHeader.name)) {
          first = true
          return true
        }

        return false
      },
    })

    const abc = [...extractored.files]

    return abc?.length > 0
  }
}

// extractRar('path/to/file.rar', 'output/directory')
