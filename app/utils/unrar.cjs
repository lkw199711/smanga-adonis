/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-04 01:24:52
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-04 01:25:04
 * @FilePath: \smanga-adonis\app\utils\unrar.cjs
 */
const fs = require('fs')
const { Unrar } = require('node-unrar-js')

function extractRar(rarFilePath, outputDir) {
  const data = fs.readFileSync(rarFilePath)
  const extractor = Unrar.createExtractorFromData(data)

  const extracted = extractor.extractAll()

  if (extracted[0].state === 'SUCCESS') {
    extracted[1].files.forEach((file) => {
      fs.writeFileSync(path.join(outputDir, file.fileHeader.name), file.fileContent)
    })
    console.log('Extraction complete')
  } else {
    console.error('Error:', extracted[0].state)
  }
}

// extractRar('path/to/file.rar', 'output/directory')

module.exports = {extractRar}