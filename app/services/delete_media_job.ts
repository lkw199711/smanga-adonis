/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-11 12:21:05
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-11 13:46:38
 * @FilePath: \smanga-adonis\app\services\delete_media_job.ts
 */
import prisma from '#start/prisma'
import { TaskPriority } from '../type/index.js'
import { scanQueue } from '#services/queue_service'

export default async function handle({ mediaId }: any) {
  if (!mediaId) return

  // 标记为删除
  await prisma.media.update({ where: { mediaId }, data: { deleteFlag: 1 } })

  // 删除漫画
  const paths = await prisma.path.findMany({ where: { mediaId } })
  paths.forEach(async (path) => {
    scanQueue.add({
      taskName: `delete_path_${path.pathId}`,
      command: 'deletePath',
      args: { pathId: path.pathId }
    }, {
      priority: TaskPriority.delete
    })
  })
}
