import prisma from '#start/prisma'
import { sql_stringify_json } from '../utils/index.js'
import { TaskPriority } from '../type/index.js'

export default async function handle({ pathId }: any) {
  if (!pathId) return

  // 标记为删除
  await prisma.path.update({ where: { pathId }, data: { deleteFlag: 1 } })

  // 删除漫画
  const mangas = await prisma.manga.findMany({ where: { pathId } })
  mangas.forEach(async (manga) => {
    await prisma.task.create({
      data: {
        taskName: `delete_manga_${manga.mangaId}`,
        command: 'deleteManga',
        priority: TaskPriority.deleteManga,
        args: sql_stringify_json({ mangaId: manga.mangaId }) as string,
      },
    })
  })
}
