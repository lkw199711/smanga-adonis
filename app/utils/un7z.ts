/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-04 01:23:38
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-12 20:58:08
 * @FilePath: \smanga-adonis\app\utils\un7z.cjs
 */
// import { createRequire } from 'module'
// const require = createRequire(import.meta.url)
import Seven from 'node-7z'

// async function extract7z(filePath: string, outputDir: string) {
//   const myStream = Seven.extractFull(filePath, outputDir)

//   myStream.on('end', () => console.log('Extraction complete'))
//   myStream.on('error', (err: any) => console.error('Error:', err))
// }

export async function extract7z(filePath: string, outputDir: string) {
  return new Promise<void>((resolve, reject) => {
    const myStream = Seven.extractFull(filePath, outputDir)

    myStream.on('end', () => {
      console.log('Extraction complete')
      resolve()
    })

    myStream.on('error', (err: any) => {
      console.error('Error:', err)
      reject(err)
    })
  })
}

export async function z_list(filePath: string) { 
  return Seven.list(filePath, {
    $cherryPick: ['*.jpg*', '*.js'],
  })
}

// extract7z('path/to/file.7z', 'output/directory')
