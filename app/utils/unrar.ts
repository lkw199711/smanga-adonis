/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-04 01:24:52
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-10 12:22:00
 * @FilePath: \smanga-adonis\app\utils\unrar.cjs
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
import * as path from 'path'
import * as fs from 'fs'
const { Unrar } = require('node-unrar-js')

function extractRar(rarFilePath: string, outputDir: string) {
  const data = fs.readFileSync(rarFilePath)
  const extractor = Unrar.createExtractorFromData(data)

  const extracted = extractor.extractAll()

  if (extracted[0].state === 'SUCCESS') {
    extracted[1].files.forEach((file: any) => {
      fs.writeFileSync(path.join(outputDir, file.fileHeader.name), file.fileContent)
    })
    console.log('Extraction complete')
  } else {
    console.error('Error:', extracted[0].state)
  }
}

// extractRar('path/to/file.rar', 'output/directory')

export { extractRar }