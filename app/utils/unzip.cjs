/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-04 00:12:16
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-04 02:45:31
 * @FilePath: \smanga-adonis\app\utils\unzip.ts
 */
const AdmZip = require('adm-zip')

function unzipFile(zipFilePath, outputDir) {
  const zip = new AdmZip(zipFilePath)
  zip.extractAllTo(outputDir, true)
}

// unzipFile('path/to/file.zip', 'output/directory')

module.exports = { unzipFile }