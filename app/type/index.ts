import { type } from "os"

enum TaskPriority {
  delete = 100000,
  deleteManga = 110000,
  scan = 200000,
  scanManga = 210000,
  copyPoster = 220000,
  createMediaPoster = 230000,
  compress = 300000,
  syncMedia = 400000,
  syncManga = 410000,
  syncChapter = 420000,
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
