/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-10-08 15:36:23
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-02-15 02:49:08
 * @FilePath: \smanga-adonis\app\services\delete_path_job.ts
 */
import prisma from '#start/prisma'
import { TaskPriority } from '../type/index.js'
import { addTask, scanQueue } from '#services/queue_service'

export default class DeletePathJob { 
  private pathId: number

  constructor({ pathId }: { pathId: number }) { 
    this.pathId = pathId
  }

  async run() { 
    const pathId = this.pathId

    if (!pathId) return
    
    // 标记为删除
    await prisma.path.update({ where: { pathId }, data: { deleteFlag: 1 } })

    // 删除漫画
    const mangas = await prisma.manga.findMany({ where: { pathId } })
    for (let index = 0; index < mangas.length; index++) {
      const manga = mangas[index];
      addTask({
        taskName: `delete_manga_${manga.mangaId}`,
        command: 'deleteManga',
        args: { mangaId: manga.mangaId },
        priority: TaskPriority.deleteManga,
      })
    }
  }
}