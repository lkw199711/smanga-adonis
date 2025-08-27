import prisma from '#start/prisma'
import { TaskPriority } from '../type/index.js'
import * as fs from 'fs'
import * as path from 'path'
import { addTask } from './queue_service.js'
import { syncApi } from '#utils/api.js'
import { ListResponse } from '#interfaces/response'

type mangaItem = {
    mangaPath: string
    mangaName: string
    mangaType: string
    parentPath: string
}

export default class SyncMediaJob {
    private source: string
    private targetMediaId: number

    constructor({ source, targetMediaId }: { source: string, targetMediaId: number }) {
        this.source = source
        this.targetMediaId = 27
    }

    async run() {
        const mangaResponse = await syncApi.mangas(`${this.source}/manga`, this.targetMediaId)
        const mangas = mangaResponse.list

        mangas.forEach((manga: any) => {
            addTask({
                taskName: 'sync_media_',
                command: 'taskSyncManga',
                args: { source: this.source, mangaInfo: manga },
                priority: TaskPriority.syncManga
            })
        })
    }
}