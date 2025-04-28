/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 17:20:05
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-10-23 00:11:57
 * @FilePath: \smanga-adonis\app\utils\sharp.ts
 */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

export async function compressImageToSize(
  inputPath: string,
  outputPath: string,
  maxSizeKB: number = 300
) {
  try {
    // 判断文件是否存在
    if (fs.existsSync(outputPath)) {
      unlink_file(inputPath)
    }

    const stats = fs.statSync(inputPath)
    const initialFileSize = stats.size

    // 如果文件初始大小已经小于目标大小，直接复制文件
    if (initialFileSize <= maxSizeKB * 1024) {
      fs.copyFileSync(inputPath, outputPath)
      unlink_file(inputPath)
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

    // 创建一个 sharp 实例
    let image = await sharp(inputPath)
    while (fileSize > maxSizeKB * 1024 && quality > 10) {
      // quality 下限为 10

      // 根据格式进行压缩
      if (isJPEG) {
        await image.jpeg({ quality }).toFile(outputPath)
      } else if (isPNG) {
        await image.png({ compressionLevel: Math.round((100 - quality) / 10) }).toFile(outputPath)
      } else if (isWEBP) {
        await image.webp({ quality }).toFile(outputPath)
      }

      // 检查压缩后的文件大小
      const stats1 = fs.statSync(outputPath)
      fileSize = stats1.size

      // console.log(`Current quality: ${quality}, File size: ${fileSize / 1024} KB`)

      // 每次递减质量
      quality -= 10
    }

    // 处理完成后销毁 sharp 实例
    await image.destroy()

    // 删除原始文件
    unlink_file(inputPath)

    if (fileSize <= maxSizeKB * 1024) {
      // console.log(`Image successfully compressed to ${fileSize / 1024} KB`)
      return true
    } else {
      // console.log(`Could not compress image to the desired size within quality limits.`)
      return false
    }
  } catch (error) {
    console.error(`Failed to compress image: ${error.message}`)
    return false
  }
}

export async function compressImageToSize1(
  inputPath: string,
  outputPath: string,
  maxSizeKB: number = 300
) {
  try {
    const stats = fs.statSync(inputPath)
    const initialFileSize = stats.size

    // 如果文件初始大小已经小于目标大小，直接复制文件
    if (initialFileSize <= maxSizeKB * 1024) {
      // 判断文件是否存在
      if (fs.existsSync(outputPath)) return
      // 复制文件
      fs.copyFileSync(inputPath, outputPath)
      return
    }

    // 预设压缩倍率
    let quality = 80 // 默认初始质量
    if (initialFileSize > maxSizeKB * 10240) {
      // 如果文件大小大于目标大小的十倍，直接使用最低压缩倍率
      quality = 10
    } else {
      console.log(initialFileSize, maxSizeKB * 10240)

      // 根据初始文件大小和目标大小调整初始质量
      quality = Math.max(
        10,
        Math.min(100, Math.ceil(((maxSizeKB * 10240) / initialFileSize) * 100))
      )
    }

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

    // 仅压缩一次，使用预设的质量值
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
    const stats1 = fs.statSync(outputPath)
    fileSize = stats1.size

    console.log(`Final quality: ${quality}, File size: ${fileSize / 1024} KB`)

    if (fileSize <= maxSizeKB * 1024) {
      console.log(`Image successfully compressed to ${fileSize / 1024} KB`)
      return true
    } else {
      console.log(`Could not compress image to the desired size within quality limits.`)
      return false
    }
  } catch (error) {
    console.error(`Failed to compress image: ${error.message}`)
    return false
  }
}

function unlink_file(inputPath: string) {
  if (/smanga_cache/.test(inputPath)) {
    fs.unlinkSync(inputPath)
  }
}
/*
// 调用示例
const inputFilePath = './your-image.jpg' // 替换为你的图片文件路径
const outputFilePath = './compressed-image.jpg' // 替换为输出压缩文件路径

compressImageToSize(inputFilePath, outputFilePath, 300) // 最大目标文件大小为 300KB
*/
