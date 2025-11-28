import { type } from "os"

enum TaskPriority {
  compress = 100000,
  delete = 200000,
  deleteManga = 210000,
  scan = 300000,
  scanManga = 310000,
  copyPoster = 320000,
  createMediaPoster = 330000,
  syncMedia = 500000,
  syncManga = 510000,
  syncChapter = 520000,
  default = 900000,
}

enum metaKeyType {
  title = 'title',
  subTitle = 'subTitle',
  author = 'author',
  star = 'star',
  describe = 'describe',
  publishDate = 'publishDate',
  classify = 'classify',
  finished = 'finished',
  updateDate = 'updateDate',
  publisher = 'publisher',
  status = 'status',
  tags = 'tags',
}

export type metaType = {
  title: string,
  subTitle: string,
  author: string,
  star: number,
  describe: string,
  publishDate: string,
  classify: string,
  finished: boolean,
  updateDate: string,
  publisher: string,
  status: string,
  tags: string[],
}

export { TaskPriority, metaKeyType }
