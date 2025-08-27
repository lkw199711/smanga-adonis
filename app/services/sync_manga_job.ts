import prisma from '#start/prisma'
import { TaskPriority } from '../type/index.js'
import * as fs from 'fs'
import * as path from 'path'
import { addTask } from './queue_service.js'
import { syncApi } from '#utils/api.js'

type mangaItem = {
    mangaPath: string
    mangaName: string
    mangaType: string
    parentPath: string
}

export default class SyncMangaJob {
    private source: string
    private targetMediaId: number
    private receivedMediaId: number
    private mangaInfo: mangaItem

    constructor({ source, mangaInfo, receivedMediaId }: { source: string, mangaInfo: mangaItem, receivedMediaId: number }) {
        this.source = source
        this.targetMediaId = 27
        this.receivedMediaId = receivedMediaId
        this.mangaInfo = mangaInfo
    }

    async run() {
        // 确定同步的路径
        const pathInfo = await prisma.path.findFirst({ where: { mediaId: this.receivedMediaId } })
        const receivedManga = await prisma.manga.findFirst({ where: { mangaName: this.mangaInfo.mangaName } })
        const targetChapters = await syncApi
        // if (targetManga) { 

        // }
        const mangaResponse = await syncApi.mangas(`${this.source}/manga`, this.targetMediaId)
        const mangas = mangaResponse.list

        mangas.forEach((manga: mangaItem) => {
            addTask({
                taskName: 'sync_manga_',
                command: 'taskSyncManga',
                args: { source: this.source, mangaInfo: manga },
                priority: TaskPriority.syncManga
            })
        })
    }
}