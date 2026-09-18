/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-11 12:21:05
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-11 13:46:38
 * @FilePath: \smanga-adonis\app\services\delete_media_job.ts
 */
import prisma from '#start/prisma'
import { TaskPriority } from '../type/index.js'
import { addTask } from '#services/queue_service'
import {
  deletePhysicalTarget,
  resolvePhysicalDeleteTarget,
} from '#services/physical_delete_service'

export default class DeleteMediaJob {
  private mediaId: number
  private deleteFile: boolean

  constructor({ mediaId, deleteFile = false }: { mediaId: number; deleteFile?: boolean }) {
    this.mediaId = mediaId
    this.deleteFile = deleteFile
  }

  async run() {
    const mediaId = this.mediaId

    if (!mediaId) return
    
    // 标记为删除
    const media = await prisma.media.update({ where: { mediaId }, data: { deleteFlag: 1 } })

    // 删除漫画
    const paths = await prisma.path.findMany({ where: { mediaId } })
    if (this.deleteFile) {
      try {
        if (media.isCloudMedia) throw new Error('云媒体库不支持删除本地实体文件')

        // 先完成全部路径校验，再开始删除，避免校验到一半时产生部分删除。
        for (const pathRecord of paths) {
          resolvePhysicalDeleteTarget(pathRecord.pathContent, pathRecord.pathContent, {
            allowRoot: true,
          })
        }
        for (const pathRecord of paths) {
          deletePhysicalTarget(pathRecord.pathContent, pathRecord.pathContent, { allowRoot: true })
        }
      } catch (error) {
        await prisma.media.update({ where: { mediaId }, data: { deleteFlag: 0 } })
        throw error
      }
    }

    for (const pathRecord of paths) {
      await addTask({
        taskName: `delete_path_${pathRecord.pathId}`,
        command: 'deletePath',
        args: { pathId: pathRecord.pathId },
        priority: TaskPriority.delete,
      })
    }
  }
}
