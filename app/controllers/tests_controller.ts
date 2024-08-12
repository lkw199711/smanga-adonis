import type { HttpContext } from '@adonisjs/core/http'
import { get_config } from '#utils/index'
// import { TaskPriority } from '#type/index'
import { SResponse } from '#interfaces/response'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
import * as path from 'path'
import * as fs from 'fs'
const unrar = require('node-unrar-js')
import { is_img } from '#utils/index'
import { extract7z,z_list } from '#utils/un7z'

export default class TestsController {
  public async index({ response }: HttpContext) {
    const config = get_config()
    const res = new SResponse({ code: 0, data: config, message: '操作成功' })
    return response.status(200).send(res)
  }

  public async unrar({ response }: HttpContext) {
    const rarFilePath = 'C:\\program-user\\10temp\\04mangas\\rar-test\\112.rar'
    const outputDir = 'C:\\program-user\\10temp\\04mangas\\rar-test'
    const buf = Uint8Array.from(fs.readFileSync(rarFilePath)).buffer
    const extractor = await unrar.createExtractorFromData({ data: buf })
    const list = extractor.getFileList()

    const listArcHeader = list.arcHeader // archive header
    const fileHeaders = [...list.fileHeaders] // load the file headers
    // const data = fs.readFileSync(rarFilePath)
    const extractored: any = extractor.extract({
      files: fileHeaders.map((fileHeader: any) => fileHeader.name),
    })
    const aa = [...extractored.files]

    // 检查解压结果
    /*
    if (extracted[0].extraction) {
      extracted[0].extraction.forEach((file: any) => {
        if (file.fileData) {
          // 创建输出文件路径
          const outputFilePath = path.join(outputDir, file.fileHeader.name)

          // 确保目录存在
          const dirName = path.dirname(outputFilePath)
          if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName, { recursive: true })
          }

          // 写入文件
          fs.writeFileSync(outputFilePath, Buffer.from(file.fileData))
          console.log(`Extracted: ${outputFilePath}`)
        }
      })

      console.log('Extraction complete.')
      return true
    } else {
      throw new Error('Extraction failed or no files were extracted')
    }*/

    response.status(200).send({ list, aa })
  }
  
  /**
   * 测试解压RAR文件
   * 解压文件将会覆盖既有文件
   * 想使文件列表扁平化, 可以使用`filenameTransform`选项 重命名文件
   * rar解压有内存与文件两个模式, 内存模式会将所有文件读取到内存中, 文件模式则会将文件写入到磁盘
   * 返回的files是一个迭代器, 可以使用`[...extractor.extract().files]`将其转换为数组 转化的同时会将所有文件解压到目标目录
   */
  public async unrar2({ response }: HttpContext) {
    const rarFilePath = 'C:\\program-user\\10temp\\04mangas\\rar-test\\112.rar'
    const outputDir = 'C:\\program-user\\10temp\\04mangas\\rar-test'
    const outputFilePath = 'C:\\program-user\\10temp\\04mangas\\rar-test\\112.jpg'

    const extractor = await unrar.createExtractorFromFile({
      filepath: rarFilePath,
      targetPath: outputDir,
      filenameTransform: (filename: string) => {
        return '112.jpg'
      },
    })

    // const extractored: any = extractor.extract({
    //   files: [
    //     '[矢吹健太朗][出包王女 全彩版 Vol.01][SHUEISHA][漢化 By G66][雙頁完整版]/ToLoveRuColor01_000.jpg',
    //   ],
    // })
    let first = false
    const extractored: any = extractor.extract({
      files: (fileHeader: any) => {
        if (first) return false

        if (is_img(fileHeader.name)) {
          first = true
          return true
        }

        return false
      }
    })

    // const files = extractored.files

    // let entry
    // while ((entry = files.next()) && !entry.done) {
    //   const { fileName, fileData } = entry.value

    //   // 判断是否为图片文件
    //   if (is_img(fileName)) {
    //     // 确保目录存在
    //     const dirName = path.dirname(outputFilePath)
    //     if (!fs.existsSync(dirName)) {
    //       fs.mkdirSync(dirName, { recursive: true })
    //     }

    //     // 写入文件
    //     fs.writeFileSync(outputFilePath, Buffer.from(fileData))
    //     console.log(`Extracted: ${outputFilePath}`)

    //     return true
    //   }
    // }

    const aa = [...extractored.files]
    // const aa = await extractored.files[0]

    response.status(200).send({ extractored })

    // Extract the files
    // [...extractor.extract().files];
  }

  public async un7z({ response }: HttpContext) {
    const rarFilePath = 'C:\\program-user\\10temp\\04mangas\\rar-test\\112.7z'
    // const outputDir = 'C:\\program-user\\10temp\\04mangas\\rar-test'
    const outputDir = 'C:\\program-user\\10temp\\04mangas\\這是一段繁體字'
    const outputFilePath = 'C:\\program-user\\10temp\\04mangas\\rar-test\\112.jpg'

    const abc = await extract7z(rarFilePath, outputDir)

    response.status(200).send({ abc })
  }

  public async zzz({ response }: HttpContext) { 
    const rarFilePath = 'C:\\program-user\\10temp\\04mangas\\rar-test\\112.7z'
    const list = await z_list(rarFilePath)

    response.status(200).send({ list })
  }
  
}
