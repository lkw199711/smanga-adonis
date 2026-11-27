import { purgeLibraryContainer } from './library_delete_service.js'

export default class DeletePathJob {
  constructor(private args: { pathId: number; purge?: boolean; deleteFile?: boolean }) {}

  async run() {
    const { pathId, purge, deleteFile = false } = this.args
    if (pathId && purge) await purgeLibraryContainer('path', pathId, deleteFile)
  }
}
