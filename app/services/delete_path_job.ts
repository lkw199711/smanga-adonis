/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-10-08 15:36:23
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-01-17 18:39:24
 * @FilePath: \smanga-adonis\app\services\delete_path_job.ts
 */
import prisma from '#start/prisma'
import { TaskPriority } from '../type/index.js'
import { scanQueue } from '#services/queue_service'

export default async function handle({ pathId }: any) {
  if (!pathId) return

  // 标记为删除
  await prisma.path.update({ where: { pathId }, data: { deleteFlag: 1 } })

  // 删除漫画
  const mangas = await prisma.manga.findMany({ where: { pathId } })
  mangas.forEach(async (manga) => {
    scanQueue.add({
      taskName: `delete_manga_${manga.mangaId}`,
      command: 'deleteManga',
      args: { mangaId: manga.mangaId }
    }, {
      priority: TaskPriority.deleteManga,
      timeout: 1000 * 60 * 1,
    })
  })
}
