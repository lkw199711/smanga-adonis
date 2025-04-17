/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-11 10:49:45
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-02-10 19:11:16
 * @FilePath: \smanga-adonis\app\services\delete_chapter_job.ts
 */
import prisma from '#start/prisma'
import { s_delete } from '#utils/index'

export default class DeleteChapterJob {
  private chapterId: number

  constructor({ chapterId }: { chapterId: number }) {
    this.chapterId = chapterId
  }

  async run() {
    const chapterId = this.chapterId

    if (!chapterId) return

    // 标记为删除
    await prisma.chapter.update({ where: { chapterId }, data: { deleteFlag: 1 } })

    // 删除书签
    const bookmarks = await prisma.bookmark.findMany({ where: { chapterId } })
    for (let index = 0; index < bookmarks.length; index++) {
      const bookmark = bookmarks[index];
      if (bookmark.pageImage && /smanga_bookmark/.test(bookmark.pageImage)) {
        s_delete(bookmark.pageImage)
      }
    }

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
}
