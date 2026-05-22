import ScanPathJob from '../scan_job.js'
import ScanMangaJob from '../scan_manga_job.js'
import DeleteChapterJob from '../delete_chapter_job.js'
import DeleteMangaJob from '../delete_manga_job.js'
import DeletePathJob from '../delete_path_job.js'
import DeleteMediaJob from '../delete_media_job.js'
import CopyPosterJob from '../copy_poster_job.js'
import CreateMediaPosterJob from '../create_media_poster_job.js'
import ReloadMangaMetaJob from '../reload_manga_meta_job.js'
import SyncMediaJob from '../sync_media_job.js'
import SyncMangaJob from '../sync_manga_job.js'
import SyncChapterJob from '../sync_chapter_job.js'
import CompressChapterJob from '../compress_chapter_job.js'
import ClearCompressJob from '../clear_compress_job.js'
import P2PPullJob from '../p2p/p2p_pull_job.js'
import PullMediaJob from '../p2p/pull/pull_media_sub_job.js'
import PullMangaJob from '../p2p/pull/pull_manga_sub_job.js'
import PullChapterJob from '../p2p/pull/pull_chapter_sub_job.js'
import PullMetaJob from '../p2p/pull/pull_meta_sub_job.js'

export async function runJobCommand(command: string, args: any) {
  switch (command) {
    case 'taskScanPath':
      await new ScanPathJob(args).run()
      break
    case 'taskScanManga':
      await new ScanMangaJob(args).run()
      break
    case 'deleteMedia':
      await new DeleteMediaJob(args).run()
      break
    case 'deletePath':
      await new DeletePathJob(args).run()
      break
    case 'deleteManga':
      await new DeleteMangaJob(args).run()
      break
    case 'deleteChapter':
      await new DeleteChapterJob(args).run()
      break
    case 'copyPoster':
      await new CopyPosterJob(args).run()
      break
    case 'compressChapter':
      await new CompressChapterJob(args).run()
      break
    case 'createMediaPoster':
      await new CreateMediaPosterJob(args).run()
      break
    case 'reloadMangaMeta':
      await new ReloadMangaMetaJob(args).run()
      break
    case 'clearCompressCache':
      await new ClearCompressJob().run()
      break
    case 'taskSyncMedia':
      await new SyncMediaJob(args).run()
      break
    case 'taskSyncManga':
      await new SyncMangaJob(args).run()
      break
    case 'taskSyncChapter':
      await new SyncChapterJob(args).run()
      break
    case 'taskP2PPull':
      await new P2PPullJob(args).run()
      break
    case 'taskP2PPullMedia':
      await new PullMediaJob(args).run()
      break
    case 'taskP2PPullManga':
      await new PullMangaJob(args).run()
      break
    case 'taskP2PPullChapter':
      await new PullChapterJob(args).run()
      break
    case 'taskP2PPullMeta':
      await new PullMetaJob(args).run()
      break
    default:
      console.warn(`[queue] unknown command: ${command}`)
      break
  }
}

export async function runJobWithTimeout(command: string, args: any, timeoutMs: number) {
  let timeoutHandle: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      runJobCommand(command, args),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Job timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}
