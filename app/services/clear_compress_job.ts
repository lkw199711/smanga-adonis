/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2025-02-10 19:11:16
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-02-10 19:11:16
 * @FilePath: \smanga-adonis\app\services\clean_compress_cache_job.ts
 */
import prisma from '#start/prisma'
import { get_config, path_compress, s_delete } from '#utils/index'
import * as fs from 'fs'
import * as path from 'path'

export default class ClearCompressCacheJob {
  async run() {
    const compressDir = path_compress()
    // 获取全部解压缩记录
    const compressRecords = await prisma.compress.findMany()
    const compressLimit = get_config().compress.limit ?? 1000

    // Check if the directory exists
    if (!fs.existsSync(compressDir)) {
      console.log('Compress directory does not exist, skipping cleanup')
      return
    }

    // 删除超出限制的部分
    if (compressRecords.length > compressLimit) {
      // 截取超出限制的部分
      const compressRecordsToDelete = compressRecords.slice(0, compressRecords.length - compressLimit)
      // 删除超出限制的部分
      await prisma.compress.deleteMany({
        where: {
          compressId: {
            in: compressRecordsToDelete.map((record) => record.compressId),
          },
        },
      })

      compressRecordsToDelete.forEach((record) => {
        s_delete(record.compressPath)
      })
    }

    const compressFolders = fs.readdirSync(compressDir)
    const compressFoldersSql = compressRecords.map((record) => path.basename(record.compressPath))

    // 删除不存在于记录中的文件夹
    compressFolders.forEach((folder) => {
      const folderPath = path.join(compressDir, folder)
      if (!compressFoldersSql.includes(folder)) {
        s_delete(folderPath)
      }
    })
  }
}
