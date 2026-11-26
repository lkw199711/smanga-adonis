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
import { LibraryPathContext } from '#services/library_path_service'
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
    const paths = await prisma.path.findMany({
      where: { mediaId },
      include: { storageRoot: true },
    })
    if (this.deleteFile) {
      try {
        if (media.isCloudMedia) throw new Error('云媒体库不支持删除本地实体文件')

        const targets = paths.map(pathRecord => {
          const context = new LibraryPathContext(pathRecord)
          const target = context.resolve(pathRecord.pathContent)
          const root = context.rootPath ?? target
          const options = { allowRoot: !context.usesStorageRoot }
          resolvePhysicalDeleteTarget(target, root, options)
          return { target, root, options }
        })
        for (const { target, root, options } of targets) {
          deletePhysicalTarget(target, root, options)
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
