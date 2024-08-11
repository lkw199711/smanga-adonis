/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-11 10:49:45
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-11 14:03:06
 * @FilePath: \smanga-adonis\app\services\delete_chapter_job.ts
 */
import prisma from '#start/prisma'
import { s_delete } from '../utils/index.js'
export default async function handle({ chapterId }: any) {
  if (!chapterId) return

  // 标记为删除
  await prisma.chapter.update({ where: { chapterId }, data: { deleteFlag: 1 } })

  // 删除书签
  const bookmarks = await prisma.bookmark.findMany({ where: { chapterId } })
  bookmarks.forEach(async (bookmark) => {
    if (bookmark.pageImage && /smanga_bookmark/.test(bookmark.pageImage)) {
      s_delete(bookmark.pageImage)
    }
  })
  await prisma.bookmark.deleteMany({ where: { chapterId } })
  // 删除收藏
  await prisma.collect.deleteMany({ where: { chapterId } })
  // 删除压缩
  const compress = await prisma.compress.findFirst({ where: { chapterId } })
  if (compress) {
    s_delete(compress.compressPath)
    await prisma.compress.delete({ where: { chapterId } })
  }

  // 删除历史
  await prisma.history.deleteMany({ where: { chapterId } })
  // 删除最后阅读记录
  await prisma.latest.deleteMany({ where: { chapterId } })

  // 删除章节 先删除章节封面
  const chapter = await prisma.chapter.findFirst({ where: { chapterId } })
  if (chapter && chapter.chapterCover && /smanga_chapter/.test(chapter.chapterCover)) {
    s_delete(chapter.chapterCover)
  }
  await prisma.chapter.delete({ where: { chapterId } })
}
