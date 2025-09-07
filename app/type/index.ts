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

enum metaType {
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
}

export { TaskPriority, metaType }
