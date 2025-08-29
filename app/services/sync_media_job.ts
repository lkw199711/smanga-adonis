import { TaskPriority } from '../type/index.js'
import { addTask } from './queue_service.js'
import { syncApi } from '#utils/api'
import { media as mediaType } from '@prisma/client'
export default class SyncMediaJob {
    private targetMediaRecord: mediaType | null = null
    private receivedPath: string
    private link: string
    private origin: string

    constructor({ receivedPath, link, origin }: { targetMediaId: number, receivedPath: string, link: string, origin: string }) {
        this.receivedPath = receivedPath
        this.link = link
        this.origin = origin
    }

    async run() {

        // 如果有 link，说明是通过分享链接同步的，需要先验证链接
        const analysisResponse = await syncApi.analysis(this.link)
        if (analysisResponse.code !== 0) {
            console.error('分享链接无效或已过期')
            return
        }

        this.targetMediaRecord = analysisResponse.data?.media
        if (!this.targetMediaRecord) {
            console.error('目标媒体信息缺失')
            return;
        }

        const mangaResponse = await syncApi.mangas(this.origin, this.targetMediaRecord.mediaId)
        const mangas = mangaResponse.list

        mangas.forEach((manga: any) => {
            addTask({
                taskName: 'sync_media_',
                command: 'taskSyncManga',
                args: { link: this.link, origin: this.origin, receivedPath: this.receivedPath, targetMangaRecord: manga },
                priority: TaskPriority.syncManga
            })
        })
    }
}