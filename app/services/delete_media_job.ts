/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-11 12:21:05
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-11 13:46:38
 * @FilePath: \smanga-adonis\app\services\delete_media_job.ts
 */
import prisma from '#start/prisma'
import { TaskPriority } from '../type/index.js'
import { addTask, scanQueue } from '#services/queue_service'

export default class DeleteMediaJob {
  private mediaId: number

  constructor({ mediaId }: { mediaId: number }) {
    this.mediaId = mediaId
  }

  async run() {
    const mediaId = this.mediaId

    if (!mediaId) return
    
    // 标记为删除
    await prisma.media.update({ where: { mediaId }, data: { deleteFlag: 1 } })

    // 删除漫画
    const paths = await prisma.path.findMany({ where: { mediaId } })
    paths.forEach(async (path) => {
      addTask({
        taskName: `delete_paths_${mediaId}`,
        command: 'deletePaths',
        args: { pathId: path.pathId },
        priority: TaskPriority.delete,
      })
    })
  }
}
