import log from '#services/log_service'

async function insert_manga_scan_log({ mediaName, mangaId, mangaName, newChapters }: any) {
  let message = ''

  if (newChapters > 0) {
    message = `[manga scan]${mediaName} ${mangaName}(${mangaId}) scan completed, new chapters: ${newChapters}`
  } else if (newChapters < 0) {
    message = `[manga scan]${mediaName} ${mangaName}(${mangaId}) scan completed, removed chapters: ${Math.abs(newChapters)}`
  } else {
    message = `[manga scan]${mediaName} ${mangaName}(${mangaId}) scan completed, no chapter changes`
  }

  await log.info({
    type: 'scan',
    module: 'scan',
    action: 'manga.scan.completed',
    message,
    context: {
      mediaName,
      mangaId,
      mangaName,
      newChapters,
    },
  })
}

async function media_cover_log({ mediaId, mediaName, mediaCover }: any) {
  const message = `[media poster]${mediaName}(${mediaId}) cover generated: ${mediaCover}`
  await log.info({
    type: 'media',
    module: 'poster',
    action: 'media.cover.generated',
    message,
    context: {
      mediaId,
      mediaName,
      mediaCover,
    },
  })
}

async function error_log(model: string, errorMsg: string) {
  const message = `${model} ${errorMsg}`

  await log.error({
    type: 'system',
    module: 'system',
    action: 'legacy.error',
    message,
    context: {
      model,
      errorMsg,
    },
  })
}

export { insert_manga_scan_log, media_cover_log, error_log }