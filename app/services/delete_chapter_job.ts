import { purgeChapter } from './library_delete_service.js'

export default class DeleteChapterJob {
  constructor(private args: { chapterId: number; deleteFile?: boolean }) {}

  async run() {
    const { chapterId, deleteFile = false } = this.args
    if (chapterId) await purgeChapter(chapterId, deleteFile)
  }
}
