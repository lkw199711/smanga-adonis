import type { HttpContext } from '@adonisjs/core/http'
import { get_config } from '#utils/index'
// import { TaskPriority } from '#type/index'
import { SResponse } from '#interfaces/response'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
import * as path from 'path'
import * as fs from 'fs'
const unrar = require('node-unrar-js')
import { is_img, write_log } from '#utils/index'
import { extract7z, Un7z } from '#utils/un7z'
import { unzipFile, extractFirstImageSyncOrder } from '#utils/unzip'
import { createCanvas, loadImage } from 'canvas'

export default class TestsController {
  public async index({ response }: HttpContext) {
    const config = get_config()
    const res = new SResponse({ code: 0, data: config, message: '操作成功' })
    return response.status(200).send(res)
  }

  public async unrar({ response }: HttpContext) {
    const rarFilePath = 'C:\\program-user\\10temp\\04mangas\\rar-test\\112.rar'
    //const outputDir = 'C:\\program-user\\10temp\\04mangas\\rar-test'
    const buf = Uint8Array.from(fs.readFileSync(rarFilePath)).buffer
    const extractor = await unrar.createExtractorFromData({ data: buf })
    const list = extractor.getFileList()

    //const listArcHeader = list.arcHeader // archive header
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
    // const outputFilePath = 'C:\\program-user\\10temp\\04mangas\\rar-test\\112.jpg'

    const extractor = await unrar.createExtractorFromFile({
      filepath: rarFilePath,
      targetPath: outputDir,
      filenameTransform: (filename: string) => {
        return path.basename(filename)
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
      },
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

    response.status(200).send({ extractored, aa })

    // Extract the files
    // [...extractor.extract().files];
  }

  public async un7z({ response }: HttpContext) {
    const rarFilePath = 'C:\\program-user\\10temp\\04mangas\\rar-test\\112.7z'
    // const outputDir = 'C:\\program-user\\10temp\\04mangas\\rar-test'
    const outputDir = 'C:\\program-user\\10temp\\04mangas\\這是一段繁體字'
    // const outputFilePath = 'C:\\program-user\\10temp\\04mangas\\rar-test\\112.jpg'

    const abc = await extract7z(rarFilePath, outputDir)

    response.status(200).send({ abc })
  }

  public async zzz({ response }: HttpContext) {
    const rarFilePath = 'C:\\program-user\\10temp\\04mangas\\7z-test\\112.7z'
    const outputDir = 'C:\\program-user\\10temp\\04mangas\\這是一段繁體字'
    const un7z = new Un7z(rarFilePath, outputDir)

    const res = await un7z.first_image_7z(rarFilePath, outputDir)

    response.status(200).send(res)
  }

  public async zip({ response }: HttpContext) {
    const rarFilePath = 'A:\\05temp\\09test\\压缩包\\001 梦想.zip'
    const outputDir = 'A:\\05temp\\09test\\解压后\\111.jpg'
    extractFirstImageSyncOrder(rarFilePath, outputDir)

    response.status(200).send(true)
    /*
    const un7z = new Un7z(rarFilePath, outputDir)

    const res = await un7z.first_image_7z(rarFilePath, outputDir)

    response.status(200).send(res)
    */
  }

  public async log({ response }: HttpContext) {
    write_log('test log')
    unzipFile
    response.status(200).send({ a: '111' })
  }

  public async test({ response }: HttpContext) {
    response
    // 使用示例
    const imagesToMerge = [
      path.join('A:\\05temp\\09test', 'en', 'cover0.jpg'),
      path.join('A:\\05temp\\09test', 'en', 'cover1.jpg'),
      path.join('A:\\05temp\\09test', 'en', 'cover2.jpg'),
      path.join('A:\\05temp\\09test', 'en', 'cover3.jpg'),
      // 'A:\\05temp\\09test\\解压后\\002.jpg',
      // 'A:\\05temp\\09test\\解压后\\003.jpg',
      // 'A:\\05temp\\09test\\解压后\\004.jpg',
      // 'A:\\05temp\\09test\\解压后\\005.jpg',
    ]; // 替换为你的图片路径
    const outputImage = 'A:\\05temp\\09test\\解压后\\cover-merged.jpg';
    mergeImages(imagesToMerge, outputImage, 60, 90);

    return '123124'
  }


}

async function mergeImages(imagePaths: string[], outputPath: string, targetWidth: number, targetHeight: number) {
  const gap = 2;
  // 加载图片
  const images = await Promise.all(imagePaths.map(path => loadImage(path)));

  // 计算合并后的画布宽度和最大高度
  const totalWidth = images.length * targetWidth + (images.length - 1) * gap; // 每张图片使用目标宽度
  const maxHeight = targetHeight; // 使用目标高度

  // 创建画布
  const canvas = createCanvas(totalWidth, maxHeight);
  const ctx = canvas.getContext('2d');

  // 填充黑色背景
  ctx.fillStyle = 'black'; // 设置填充颜色为黑色
  ctx.fillRect(0, 0, totalWidth, maxHeight); // 填充整个画布

  // 绘制图片
  let xOffset = 0;
  images.forEach(image => {
    // 绘制缩放后的图片
    ctx.drawImage(image, xOffset, 0, targetWidth, targetHeight); // 水平合并
    xOffset += (targetWidth + gap); // 更新横坐标偏移量
  });

  // 保存合并后的图片
  const buffer: any = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log('合并完成，保存至', outputPath);
}