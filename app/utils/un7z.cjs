/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-04 01:23:38
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-04 01:23:50
 * @FilePath: \smanga-adonis\app\utils\un7z.cjs
 */
const { extractFull } = require('node-7z')
const path = require('path')

function extract7z(filePath, outputDir) {
  const myStream = extractFull(filePath, outputDir)

  myStream.on('end', () => console.log('Extraction complete'))
  myStream.on('error', (err: any) => console.error('Error:', err))
}

// extract7z('path/to/file.7z', 'output/directory')

module.exports = {extract7z}