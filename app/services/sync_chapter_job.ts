import * as fs from 'fs'
import * as path from 'path'
import { download_file, syncApi } from '#utils/api'
import { chapter as chapterPrismaType } from '@prisma/client'

type chapterType = chapterPrismaType & { outCovers?: string[] }

export default class SyncChapterJob {
    private localMangaPath: string = ''
    private localChapterPath: string = ''
    private targetChapterRecord: chapterType | null
    private origin: string = ''

    constructor({ localMangaPath, targetChapterRecord, origin }: { localMangaPath: string, targetChapterRecord: chapterType, origin: string }) {
        this.targetChapterRecord = targetChapterRecord
        this.localMangaPath = localMangaPath
        this.origin = origin
    }

    async run() {
        if (!this.targetChapterRecord) {
            console.error('目标章节信息缺失')
            return
        }

        // 下载章节外置封面
        if (this.targetChapterRecord.outCovers) {
            for (let i = 0; i < this.targetChapterRecord.outCovers.length; i++) {
                const cover = this.targetChapterRecord.outCovers[i];
                const basename = path.basename(cover)
                const localPath = path.join(this.localMangaPath, basename)
                if (!fs.existsSync(localPath)) {
                    await download_file(this.origin, cover, localPath)
                }
            }
        }

        // 根据章节文件类型
        if (this.targetChapterRecord.chapterType === 'img') {
            // 根据章节名于目标漫画文件夹
            this.localChapterPath = path.join(this.localMangaPath, this.targetChapterRecord.chapterName)
            // 新建章节文件夹
            if (!fs.existsSync(this.localChapterPath)) {
                fs.mkdirSync(this.localChapterPath)
            }

            const imagesResponse = await syncApi.images(this.origin, this.targetChapterRecord.chapterId)
            const images = imagesResponse.list
            for (let image of images) {
                const basename = path.basename(image)
                const localPath = path.join(this.localChapterPath, basename)
                if (!fs.existsSync(localPath)) {
                    await download_file(this.origin, image, localPath)
                }
            }
        } else {
            const basename = path.basename(this.targetChapterRecord.chapterPath)
            this.localChapterPath = path.join(this.localMangaPath, basename)
            // 其他类型的章节处理逻辑
            if (!fs.existsSync(this.localChapterPath)) {
                await download_file(this.origin, this.targetChapterRecord.chapterPath, this.localChapterPath)
            }
        }
    }
}