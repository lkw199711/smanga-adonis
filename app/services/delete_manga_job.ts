/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-11 10:49:45
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-02-10 18:40:30
 * @FilePath: \smanga-adonis\app\services\delete_manga_job.ts
 */
import prisma from '#start/prisma'
import { s_delete } from '#utils/index'

export default class DeleteMangaJob {
  private mangaId: number

  constructor({ mangaId }: { mangaId: number }) {
    this.mangaId = mangaId
  }

  async run() {
    const mangaId = this.mangaId

    if (!mangaId) return
    
    // 标记为删除
    const manga = await prisma.manga.update({ where: { mangaId }, data: { deleteFlag: 1 } })

    // 删除书签
    const bookmarks = await prisma.bookmark.findMany({ where: { mangaId } })
    for (let index = 0; index < bookmarks.length; index++) {
      const bookmark = bookmarks[index];
      if (bookmark.pageImage && /smanga_bookmark/.test(bookmark.pageImage)) {
        s_delete(bookmark.pageImage)
      }
    }

    await prisma.bookmark.deleteMany({ where: { mangaId } })
    // 删除收藏
    await prisma.collect.deleteMany({ where: { mangaId } })
    // 删除压缩
    const compresses = await prisma.compress.findMany({ where: { mangaId } })
    for (let index = 0; index < compresses.length; index++) {
      const compress = compresses[index];
      s_delete(compress.compressPath)
    }
    await prisma.compress.deleteMany({ where: { mangaId } })
    // 删除历史
    await prisma.history.deleteMany({ where: { mangaId } })
    // 删除最后阅读记录
    await prisma.latest.deleteMany({ where: { mangaId } })
    // 删除标签关联
    await prisma.mangaTag.deleteMany({ where: { mangaId } })
    // 删除元数据
    await prisma.meta.deleteMany({ where: { mangaId } })
    // 删除章节 先删除章节封面
    const chapters = await prisma.chapter.findMany({ where: { mangaId } })
    for (let index = 0; index < chapters.length; index++) {
      const chapter = chapters[index];
      if (chapter.chapterCover && /smanga_chapter/.test(chapter.chapterCover)) {
        s_delete(chapter.chapterCover)
      }
    }
    await prisma.chapter.deleteMany({ where: { mangaId } })

    // 删除漫画封面
    if (manga.mangaCover && /smanga_manga/.test(manga.mangaCover)) {
      s_delete(manga.mangaCover)
    }
    // 删除漫画
    await prisma.manga.delete({ where: { mangaId } })
  }
}
