import { purgeLibraryContainer } from './library_delete_service.js'

export default class DeleteMediaJob {
  constructor(private args: { mediaId: number; purge?: boolean; deleteFile?: boolean }) {}

  async run() {
    const { mediaId, purge, deleteFile = false } = this.args
    if (mediaId && (purge || deleteFile)) await purgeLibraryContainer('media', mediaId, deleteFile)
  }
}
