import { purgeManga } from './library_delete_service.js'

export default class DeleteMangaJob {
  constructor(private args: { mangaId: number; deleteFile?: boolean; pathId?: number }) {}

  async run() {
    const { mangaId, deleteFile = false, pathId } = this.args
    if (mangaId) await purgeManga(mangaId, deleteFile, pathId)
  }
}
