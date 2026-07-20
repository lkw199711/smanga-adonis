import { createRequire } from 'module'
const require = createRequire(import.meta.url)
import * as path from 'path'
import { first_archive_cover_or_image } from './index.js'
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

  const list: any = extractor.getFileList()
  const fileHeaders = [...list.fileHeaders]
  const firstImage = first_archive_cover_or_image(
    fileHeaders
      .filter((fileHeader: any) => !fileHeader.flags?.directory)
      .map((fileHeader: any) => fileHeader.name)
  )

  if (!firstImage) return false

  const extractored: any = extractor.extract({
    files: [firstImage],
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

    const list: any = extractor.getFileList()
    const fileHeaders = [...list.fileHeaders]
    const firstImage = first_archive_cover_or_image(
      fileHeaders
        .filter((fileHeader: any) => !fileHeader.flags?.directory)
        .map((fileHeader: any) => fileHeader.name)
    )

    if (!firstImage) return false

    const extractored: any = extractor.extract({
      files: [firstImage],
    })

    const abc = [...extractored.files]

    return abc?.length > 0
  }
}

// extractRar('path/to/file.rar', 'output/directory')
