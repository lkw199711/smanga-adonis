/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
const UsersController = () => import('#controllers/users_controller')
const CollectsController = () => import('#controllers/collects_controller')
const CompressesController = () => import('#controllers/compresses_controller')
const HistoriesController = () => import('#controllers/histories_controller')
const LatestsController = () => import('#controllers/latests_controller')
const LogsController = () => import('#controllers/logs_controller')
const LoginController = () => import('#controllers/login_controller')
const TasksController = () => import('#controllers/tasks_controller')
const MediaController = () => import('#controllers/media_controller')
const PathsController = () => import('#controllers/paths_controller')
const BookmarksController = () => import('#controllers/bookmarks_controller')
const TagsController = () => import('#controllers/tags_controller')
const MangaController = () => import('#controllers/manga_controller')
const chaptersController = () => import('#controllers/chapters_controller')
const ImagesController = () => import('#controllers/images_controller')
const MangaTagController = () => import('#controllers/manga_tags_controller')
const ChartsController = () => import('#controllers/charts_controller')
const SearchesController = () => import('#controllers/searches_controller')
const ConfigsController = () => import('#controllers/configs_controller')
const TestsController = () => import('#controllers/tests_controller')
const DeploysController = () => import('#controllers/deploys_controller')
const FilesController = () => import('#controllers/files_controller')
const SharesController = () => import('#controllers/shares_controller')
const SyncsController = () => import('#controllers/syncs_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router.get('/test', async ({ request }) => {
  request
})
router.get('/test1', [TestsController, 'index'])
router.get('/test/unrar', [TestsController, 'unrar2'])
router.get('/test/7z', [TestsController, 'un7z'])
router.get('/test/7z1', [TestsController, 'zzz'])
router.get('/test/7z2', [TestsController, 'zzz'])
router.get('/test/log', [TestsController, 'log'])
router.get('/test/zip', [TestsController, 'zip'])
router.get('/test/m', [TestsController, 'test'])


router.any('/image', [ImagesController, 'index'])

// 部署
router.get('/deploy/database-get', [DeploysController, 'database_get'])
router.get('/deploy/database-test', [DeploysController, 'database_test'])
router.get('/deploy/database-check', [DeploysController, 'database_check'])

// 收藏模块 collect
router.get('/collect', [CollectsController, 'index'])
router.get('/collect-manga', [CollectsController, 'mangas'])
router.get('/collect-chapter', [CollectsController, 'chapters'])
router.get('/collect/:collectId', [CollectsController, 'show'])
router.post('/collect', [CollectsController, 'create'])
router.put('/collect/:collectId', [CollectsController, 'update'])
router.delete('/collect/:collectId', [CollectsController, 'destroy'])
router.post('/collect-manga/:mangaId', [CollectsController, 'collect_manga'])
router.get('/manga-iscollect/:mangaId', [CollectsController, 'is_collect'])
router.post('/collect-chapter/:chapterId', [CollectsController, 'collect_chapter'])
router.get('/chapter-iscollect/:chapterId', [CollectsController, 'is_collect'])

// 书签
router.get('/bookmark', [BookmarksController, 'index'])
router.get('/bookmark/:bookmarkId', [BookmarksController, 'show'])
router.post('/bookmark', [BookmarksController, 'create'])
router.put('/bookmark/:bookmarkId', [BookmarksController, 'update'])
router.delete('/bookmark/:bookmarkId', [BookmarksController, 'destroy'])

// 压缩模块 compress
router.get('/compress', [CompressesController, 'index'])
router.get('/compress/:compressId', [CompressesController, 'show'])
router.post('/compress', [CompressesController, 'create'])
router.put('/compress/:compressId', [CompressesController, 'update'])
router.delete('/compress/:compressId', [CompressesController, 'destroy'])

// 历史记录模块 history
router.get('/history', [HistoriesController, 'index'])
router.get('/history/:historyId', [HistoriesController, 'show'])
router.post('/history', [HistoriesController, 'create'])
router.put('/history/:chapterId', [HistoriesController, 'update'])
router.delete('/history/:chapterId', [HistoriesController, 'destroy'])
router.put('/read-all-chapters/:mangaId', [HistoriesController, 'read_all_chapters'])
router.put('/unread-all-chapters/:mangaId', [HistoriesController, 'unread_all_chapters'])
router.get('/chapter-is-read/:chapterId', [HistoriesController, 'chapter_is_read'])

// 最后阅读记录 latest
router.get('/latest', [LatestsController, 'index'])
router.get('/latest/:mangaId', [LatestsController, 'show'])
router.post('/latest', [LatestsController, 'create'])
router.put('/latest/:chapterId', [LatestsController, 'update'])
router.delete('/latest/:chapterId', [LatestsController, 'destroy'])

// 日志模块 log
router.get('/log', [LogsController, 'index'])
router.get('/log/:logId', [LogsController, 'show'])
router.post('/log', [LogsController, 'create'])
router.put('/log/:logId', [LogsController, 'update'])
router.delete('/log/:logId', [LogsController, 'destroy'])

// 登录记录 login
router.get('/login', [LoginController, 'index'])
router.get('/login/:loginId', [LoginController, 'show'])
router.post('/login', [LoginController, 'create'])
router.put('/login/:loginId', [LoginController, 'update'])
router.delete('/login/:loginId', [LoginController, 'destroy'])

// 任务
router.get('/task', [TasksController, 'select'])
router.get('/task/:taskId', [TasksController, 'show'])
router.delete('/task/:taskId', [TasksController, 'destroy'])
router.delete('/task', [TasksController, 'destroy_all'])

// 媒体库
router.get('/media', [MediaController, 'index'])
router.get('/media/:mediaId', [MediaController, 'show'])
router.post('/media', [MediaController, 'create'])
router.put('/media/:mediaId', [MediaController, 'update'])
router.delete('/media/:mediaId', [MediaController, 'destroy'])
router.put('/media-cover/:mediaId', [MediaController, 'poster'])
router.put('/media/:mediaId/scan', [MediaController, 'scan'])

// 路径
router.get('/path', [PathsController, 'index'])
router.get('/path/:pathId', [PathsController, 'show'])
router.post('/path', [PathsController, 'create'])
router.put('/path/:pathId', [PathsController, 'update'])
router.delete('/path/:pathId', [PathsController, 'destroy'])
router.put('/path/scan/:pathId', [PathsController, 'scan'])

// 标签
router.get('/tag', [TagsController, 'index'])
router.get('/tag/:tagId', [TagsController, 'show'])
router.post('/tag', [TagsController, 'create'])
router.put('/tag/:tagId', [TagsController, 'update'])
router.delete('/tag/:tagId', [TagsController, 'destroy'])

router.get('/manga-tag/:mangaId', [TagsController, 'manga_tags'])
router.post('/manga-tag', [MangaTagController, 'create'])
router.delete('/manga-tag/:mangaTagId', [MangaTagController, 'destroy'])

router.get('/tags-manga', [TagsController, 'tags_manga'])

// 漫画
router.get('/manga', [MangaController, 'index'])
router.get('/manga/:mangaId', [MangaController, 'show'])
router.post('/manga', [MangaController, 'create'])
router.put('/manga/:mangaId', [MangaController, 'update'])
router.delete('/manga/:mangaId', [MangaController, 'destroy'])
router.put('/manga/:mangaId/scan', [MangaController, 'scan'])
router.put('/manga/:mangaId/reload-meta', [MangaController, 'reload_meta'])
router.put('/manga/:mangaId/meta', [MangaController, 'edit_meta'])
router.put('/manga/:mangaId/tags', [MangaController, 'add_tags'])

// 章节
router.get('/chapter', [chaptersController, 'index'])
router.get('/chapter/:chapterId', [chaptersController, 'show'])
router.post('/chapter', [chaptersController, 'create'])
router.put('/chapter/:chapterId', [chaptersController, 'update'])
router.delete('/chapter/:chapterId', [chaptersController, 'destroy'])
router.get('/chapter-images/:chapterId', [chaptersController, 'images'])
router.get('/chapter-first', [chaptersController, 'first'])

// 用户
router.get('/user', [UsersController, 'index'])
router.get('/user/:userId', [UsersController, 'show'])
router.post('/user', [UsersController, 'create'])
router.put('/user/:userId', [UsersController, 'update'])
router.delete('/user/:userId', [UsersController, 'destroy'])

// 图表
router.get('chart-browse', [ChartsController, 'browse'])
router.get('chart-tag', [ChartsController, 'tag'])
router.get('chart-ranking', [ChartsController, 'ranking'])
router.get('chart-frequency', [ChartsController, 'frequency'])

// 搜索
router.get('/search-mangas', [SearchesController, 'mangas'])
router.get('/search-chapters', [SearchesController, 'chapters'])

// 分享
router.get('/share', [SharesController, 'index'])
router.get('/share/:shareId', [SharesController, 'show'])
router.post('/share', [SharesController, 'create'])
router.put('/share/:shareId', [SharesController, 'update'])
router.delete('/share/:shareId', [SharesController, 'destroy'])
router.get('/analysis', [SharesController, 'analysis'])
router.get('/analysis/chapters', [SharesController, 'analysis_chapters'])
router.get('/analysis/mangas', [SharesController, 'analysis_mangas'])
router.get('/analysis/images', [SharesController, 'analysis_images'])

// 同步
router.get('/sync', [SyncsController, 'select'])
router.post('/sync', [SyncsController, 'create'])
router.put('/sync/:syncId', [SyncsController, 'update'])
router.delete('/sync/:syncId', [SyncsController, 'destroy'])
router.post('/sync/execute/:syncId', [SyncsController, 'execute'])

// 配置信息
router.get('client-user-config', [UsersController, 'config'])
router.get('serve-config', [ConfigsController, 'get'])
router.put('serve-config', [ConfigsController, 'set'])
router.put('user-config', [ConfigsController, 'user_config'])

// 资源文件
router.get('/file/apk', [FilesController, 'apk'])
router.get('/file', [FilesController, 'index'])
router.post('/file', [FilesController, 'index'])