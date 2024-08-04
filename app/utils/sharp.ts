/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 17:20:05
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-03 17:22:22
 * @FilePath: \smanga-adonis\app\utils\sharp.ts
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

export default async function compressImageToSize(
  inputPath: string,
  outputPath: string,
  maxSizeKB: number = 300
) {
  try {
    const stats = fs.statSync(inputPath)
    const initialFileSize = stats.size

    // 如果文件初始大小已经小于目标大小，直接复制文件
    if (initialFileSize <= maxSizeKB * 1024) {
      fs.copyFileSync(inputPath, outputPath)
      return
    }

    let quality = 80 // 初始质量
    let fileSize = Infinity // 初始文件大小

    // 获取文件扩展名
    const ext = path.extname(inputPath).toLowerCase()

    // 图片格式判断
    const isJPEG = ext === '.jpeg' || ext === '.jpg'
    const isPNG = ext === '.png'
    const isWEBP = ext === '.webp'

    if (!isJPEG && !isPNG && !isWEBP) {
      throw new Error(`Unsupported file format: ${ext}`)
    }

    while (fileSize > maxSizeKB * 1024 && quality > 10) {
      // quality 下限为 10
      // 创建一个 sharp 实例
      const image = sharp(inputPath)

      // 根据格式进行压缩
      if (isJPEG) {
        await image.jpeg({ quality }).toFile(outputPath)
      } else if (isPNG) {
        await image.png({ compressionLevel: Math.round((100 - quality) / 10) }).toFile(outputPath)
      } else if (isWEBP) {
        await image.webp({ quality }).toFile(outputPath)
      }

      // 检查压缩后的文件大小
      const stats = fs.statSync(outputPath)
      fileSize = stats.size

      console.log(`Current quality: ${quality}, File size: ${fileSize / 1024} KB`)

      // 每次递减质量
      quality -= 10
    }

    if (fileSize <= maxSizeKB * 1024) {
      console.log(`Image successfully compressed to ${fileSize / 1024} KB`)
    } else {
      console.log(`Could not compress image to the desired size within quality limits.`)
    }
  } catch (error) {
    console.error(`Failed to compress image: ${error.message}`)
  }
}

/*
// 调用示例
const inputFilePath = './your-image.jpg' // 替换为你的图片文件路径
const outputFilePath = './compressed-image.jpg' // 替换为输出压缩文件路径

compressImageToSize(inputFilePath, outputFilePath, 300) // 最大目标文件大小为 300KB
*/
