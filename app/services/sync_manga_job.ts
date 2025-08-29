import { TaskPriority } from '../type/index.js'
import * as fs from 'fs'
import * as path from 'path'
import { addTask } from './queue_service.js'
import { download_file, syncApi } from '#utils/api'
import { manga as mangaPrismaType } from '@prisma/client'

type mangaType = mangaPrismaType & { outCovers: string[], metaFiles: string[], media: { mediaId: number, mediaName: string, mediaType: number } }

export default class SyncMangaJob {
    private receivedPath: string
    private localMangaPath: string = ''
    private link: string = ''
    private origin: string = ''
    private targetMangaRecord: mangaType | null = null

    constructor({ link, origin, targetMangaRecord, receivedPath }:
        { link: string, origin: string, targetMangaRecord: mangaType, receivedPath: string }) {
        this.receivedPath = receivedPath
        this.link = link
        this.origin = origin
        this.targetMangaRecord = targetMangaRecord
    }

    async run() {
        // 获取目标漫画信息
        if (!this.targetMangaRecord && this.link) {
            // 如果有 link，说明是通过分享链接同步的，需要先验证链接
            const analysisResponse = await syncApi.analysis(this.link)
            if (analysisResponse.code !== 0) {
                console.error('分享链接无效或已过期')
                return
            }

            this.targetMangaRecord = analysisResponse.data.manga
        } else {
            if (!this.targetMangaRecord) {
                console.error('目标漫画信息缺失')
                return
            }
        }

        if (!this.targetMangaRecord) {
            console.error('目标漫画信息缺失')
            return
        }

        // 根据漫画名于目标路径新建漫画文件夹
        if (this.targetMangaRecord.media.mediaType == 0) {
            this.localMangaPath = path.join(this.receivedPath, this.targetMangaRecord.mangaName)
            if (!fs.existsSync(this.localMangaPath)) {
                fs.mkdirSync(this.localMangaPath)
            }
        } else {
            this.localMangaPath = this.receivedPath;
        }

        // 下载漫画外置封面
        if (this.targetMangaRecord.outCovers) {
            for (let cover of this.targetMangaRecord.outCovers) {
                const basename = path.basename(cover)
                const localPath = path.join(this.localMangaPath, basename)
                if (!fs.existsSync(localPath)) {
                    await download_file(this.origin, cover, localPath)
                }
            }
        }

        // 下载漫画元数据文件
        if (this.targetMangaRecord.metaFiles) {
            const metaDir = this.localMangaPath + '-smanga-info';
            if (!fs.existsSync(metaDir)) {
                fs.mkdirSync(metaDir);
            }

            for (let metaFile of this.targetMangaRecord.metaFiles) {
                const basename = path.basename(metaFile)
                const localPath = path.join(metaDir, basename)
                if (!fs.existsSync(localPath)) {
                    await download_file(this.origin, metaFile, localPath)
                }
            }
        }

        // 获取目标漫画的所有章节信息
        const targetChaptersResponse = await syncApi.chapters(this.origin, this.targetMangaRecord.mangaId)
        const targetChapters = targetChaptersResponse.list;
        if (!targetChapters || targetChapters.length === 0) {
            console.error('目标漫画章节信息为空')
            return
        }

        // 遍历所有章节，创建章节同步任务
        targetChapters.forEach(async (chapter: any) => {
            addTask({
                taskName: 'sync_chapter_' + chapter.chapterName,
                command: 'taskSyncChapter',
                args: { localMangaPath: this.localMangaPath, targetChapterRecord: chapter, origin: this.origin },
                priority: TaskPriority.syncChapter
            })
        })
    }
}