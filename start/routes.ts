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
const HomepageController = () => import('#controllers/homepage_controller')
const OpdsController = () => import('#controllers/opds_controller')
const TrackerNodesController = () => import('#controllers/tracker/tracker_nodes_controller')
const TrackerGroupsController = () => import('#controllers/tracker/tracker_groups_controller')
const TrackerSharesController = () => import('#controllers/tracker/tracker_shares_controller')
const P2PGroupsController = () => import('#controllers/p2p/p2p_groups_controller')
const P2PSharesController = () => import('#controllers/p2p/p2p_shares_controller')
const P2PPeersController = () => import('#controllers/p2p/p2p_peers_controller')
const P2PServeController = () => import('#controllers/p2p/p2p_serve_controller')
const P2PTransfersController = () => import('#controllers/p2p/p2p_transfers_controller')

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
router.get('/test/zip2', [TestsController, 'zip2'])


router.any('/image', [ImagesController, 'index'])
router.post('/image/upload', [ImagesController, 'upload'])

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
router.delete('/bookmark/:bookmarkIds/batch', [BookmarksController, 'destroy_batch'])

// 压缩模块 compress
router.get('/compress', [CompressesController, 'index'])
router.get('/compress/:compressId', [CompressesController, 'show'])
router.post('/compress', [CompressesController, 'create'])
router.put('/compress/:compressId', [CompressesController, 'update'])
router.delete('/compress/:compressId', [CompressesController, 'destroy'])
router.delete('/compress/:compressIds/batch', [CompressesController, 'destroy_batch'])
router.delete('/compress-clear', [CompressesController, 'clear'])



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
router.delete('/task/:taskIds/batch', [TasksController, 'destroy_batch'])

// 媒体库
router.get('/media', [MediaController, 'index'])
router.get('/media/:mediaId', [MediaController, 'show'])
router.post('/media', [MediaController, 'create'])
router.put('/media/:mediaId', [MediaController, 'update'])
router.delete('/media/:mediaId', [MediaController, 'destroy'])
router.delete('/media/:mediaIds/batch', [MediaController, 'destroy_batch'])
router.put('/media-cover/:mediaId', [MediaController, 'poster'])
router.put('/media/:mediaId/scan', [MediaController, 'scan'])

// 路径
router.get('/path', [PathsController, 'index'])
router.get('/path/:pathId', [PathsController, 'show'])
router.post('/path', [PathsController, 'create'])
router.put('/path/:pathId', [PathsController, 'update'])
router.delete('/path/:pathId', [PathsController, 'destroy'])
router.delete('/path/:pathIds/batch', [PathsController, 'destroy_batch'])
router.put('/path/scan/:pathId', [PathsController, 'scan'])
router.put('/path/:pathId/rescan', [PathsController, 're_scan'])

// 标签
router.get('/tag', [TagsController, 'index'])
router.get('/tag/:tagId', [TagsController, 'show'])
router.post('/tag', [TagsController, 'create'])
router.put('/tag/:tagId', [TagsController, 'update'])
router.delete('/tag/:tagId', [TagsController, 'destroy'])
router.delete('/tag/:tagIds/batch', [TagsController, 'destroy_batch'])


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
router.delete('/manga/:mangaIds/batch', [MangaController, 'destroy_batch'])
router.put('/manga/:mangaId/scan', [MangaController, 'scan'])
router.put('/manga/:mangaId/reload-meta', [MangaController, 'reload_meta'])
router.put('/manga/:mangaId/meta', [MangaController, 'edit_meta'])
router.put('/manga/:mangaId/tags', [MangaController, 'add_tags'])
router.put('/manga/:mangaId/compress', [MangaController, 'compress_all'])
router.delete('/manga/:mangaId/compress', [MangaController, 'compress_delete'])

// 章节
router.get('/chapter', [chaptersController, 'index'])
router.get('/chapter/:chapterId', [chaptersController, 'show'])
router.post('/chapter', [chaptersController, 'create'])
router.put('/chapter/:chapterId', [chaptersController, 'update'])
router.delete('/chapter/:chapterId', [chaptersController, 'destroy'])
router.delete('/chapter/:chapterIds/batch', [chaptersController, 'destroy_batch'])
router.get('/chapter-images/:chapterId', [chaptersController, 'images'])
router.get('/chapter-first', [chaptersController, 'first'])
router.delete('/chapter/:chapterId/compress', [chaptersController, 'compress_delete'])

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
router.delete('/share/:shareIds/batch', [SharesController, 'destroy_batch'])
router.get('/analysis', [SharesController, 'analysis'])
router.get('/analysis/chapters', [SharesController, 'analysis_chapters'])
router.get('/analysis/mangas', [SharesController, 'analysis_mangas'])
router.get('/analysis/images', [SharesController, 'analysis_images'])

// 同步
router.get('/sync', [SyncsController, 'select'])
router.post('/sync', [SyncsController, 'create'])
router.put('/sync/:syncId', [SyncsController, 'update'])
router.delete('/sync/:syncId', [SyncsController, 'destroy'])
router.delete('/sync/:syncIds/batch', [SyncsController, 'destroy_batch'])
router.post('/sync/execute/:syncId', [SyncsController, 'execute'])

// ============================================================
// Tracker 角色路由 - 由 TrackerAuthMiddleware 统一鉴权
// 仅当 smanga.json 里 p2p.enable=true 且 p2p.role.tracker=true 时生效
// ============================================================

// 节点生命周期
router.post('/tracker/node/register', [TrackerNodesController, 'register'])
router.post('/tracker/node/heartbeat', [TrackerNodesController, 'heartbeat'])
router.patch('/tracker/node/me', [TrackerNodesController, 'update'])
router.delete('/tracker/node/me', [TrackerNodesController, 'deregister'])

// 群组管理
router.get('/tracker/group', [TrackerGroupsController, 'index'])
router.post('/tracker/group', [TrackerGroupsController, 'create'])
router.post('/tracker/group/join', [TrackerGroupsController, 'join'])
router.post('/tracker/group/:groupNo/leave', [TrackerGroupsController, 'leave'])
router.get('/tracker/group/:groupNo/members', [TrackerGroupsController, 'members'])
router.delete('/tracker/group/:groupNo/member/:nodeId', [TrackerGroupsController, 'kick'])
router.post('/tracker/group/:groupNo/invite', [TrackerGroupsController, 'invite'])

// 共享索引
router.post('/tracker/group/:groupNo/announce', [TrackerSharesController, 'announce'])
router.get('/tracker/group/:groupNo/shares', [TrackerSharesController, 'index'])
router.get('/tracker/group/:groupNo/seeds', [TrackerSharesController, 'seeds'])

// 配置信息
router.get('client-user-config', [UsersController, 'config'])
router.get('serve-config', [ConfigsController, 'get'])
router.put('serve-config', [ConfigsController, 'set'])
router.put('user-config', [ConfigsController, 'user_config'])

// 资源文件
router.get('/file/apk', [FilesController, 'apk'])
router.get('/file', [FilesController, 'index'])
router.post('/file', [FilesController, 'index'])

// HomePage (gethomepage.dev) customapi 适配
// 通过 apikey 鉴权，不走 token 中间件; 详见 homepage_controller.ts
router.get('/homepage/statistic', [HomepageController, 'statistic'])

// ============================================================================
// OPDS 1.2 协议 (供 可达漫画 / Panels / Chunky 等第三方阅读器订阅)
// 鉴权方式: HTTP Basic Auth, 详见 auth_middleware.ts
// ============================================================================
router.get('/opds', [OpdsController, 'root'])
router.get('/opds/opensearch.xml', [OpdsController, 'opensearch'])
router.get('/opds/search', [OpdsController, 'search'])
router.get('/opds/latest', [OpdsController, 'latest'])
router.get('/opds/collects', [OpdsController, 'collects'])
router.get('/opds/libraries', [OpdsController, 'libraries'])
router.get('/opds/libraries/:mediaId', [OpdsController, 'library_mangas'])
router.get('/opds/manga/:mangaId', [OpdsController, 'manga_chapters'])
router.get('/opds/manga/:mangaId/cover', [OpdsController, 'manga_cover'])
router.get('/opds/chapter/:chapterId', [OpdsController, 'chapter_entry'])
router.get('/opds/chapter/:chapterId/cover', [OpdsController, 'chapter_cover'])
router.get('/opds/chapter/:chapterId/download', [OpdsController, 'chapter_download'])
router.get('/opds/chapter/:chapterId/page/:page', [OpdsController, 'chapter_page'])

// ============================================================================
// P2P 用户/管理接口 (/p2p/*)
// 鉴权: auth_middleware(用户 token)
// 注意: 与对等节点接口 /p2p/serve/* 通过子前缀隔离, 便于中间件按前缀区分
// ============================================================================
router.get('/p2p/group', [P2PGroupsController, 'index'])
router.get('/p2p/group/:id', [P2PGroupsController, 'show'])
router.post('/p2p/group/create', [P2PGroupsController, 'create'])
router.post('/p2p/group/join', [P2PGroupsController, 'join'])
router.post('/p2p/group/leave', [P2PGroupsController, 'leave'])
router.post('/p2p/group/refresh', [P2PGroupsController, 'refresh'])

router.get('/p2p/share', [P2PSharesController, 'index'])
router.post('/p2p/share/create', [P2PSharesController, 'create'])
router.put('/p2p/share/:id', [P2PSharesController, 'update'])
router.delete('/p2p/share/:id', [P2PSharesController, 'destroy'])
router.post('/p2p/share/announce', [P2PSharesController, 'announce'])

router.get('/p2p/peer/members/:groupNo', [P2PPeersController, 'members'])
router.get('/p2p/peer/shares/:groupNo', [P2PPeersController, 'shares'])
router.get('/p2p/peer/cache/:groupNo', [P2PPeersController, 'cache'])

// P2P 传输任务
router.get('/p2p/transfer', [P2PTransfersController, 'index'])
router.get('/p2p/transfer/:id', [P2PTransfersController, 'show'])
router.post('/p2p/transfer/pull', [P2PTransfersController, 'pull'])
router.post('/p2p/transfer/clear', [P2PTransfersController, 'clear'])
router.post('/p2p/transfer/:id/cancel', [P2PTransfersController, 'cancel'])
router.post('/p2p/transfer/:id/retry', [P2PTransfersController, 'retry'])
router.delete('/p2p/transfer/:id', [P2PTransfersController, 'destroy'])

// ============================================================================
// P2P 对等节点接口 (/p2p/serve/*)
// 鉴权: p2p_peer_auth_middleware(X-Node-Id + X-Group-No)
// 节点间直连(不经 nginx/反向代理),所以路径需与 adonis 实际监听一致
// ============================================================================
router.get('/p2p/serve/ping', [P2PServeController, 'ping'])
router.get('/p2p/serve/shares', [P2PServeController, 'shares'])
router.get('/p2p/serve/media/:mediaId/mangas', [P2PServeController, 'mangas'])
router.get('/p2p/serve/manga/:mangaId/chapters', [P2PServeController, 'chapters'])
router.get('/p2p/serve/manga/:mangaId/tree', [P2PServeController, 'tree'])
router.get('/p2p/serve/chapter/:chapterId/tree', [P2PServeController, 'chapter_tree'])
router.get('/p2p/serve/chapter/:chapterId/images', [P2PServeController, 'images'])
router.post('/p2p/serve/file', [P2PServeController, 'file'])
router.get('/p2p/serve/file', [P2PServeController, 'file'])
router.post('/p2p/serve/file/stat', [P2PServeController, 'file_stat'])
