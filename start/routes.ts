/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-06-20 19:41:31
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-06 11:03:49
 * @FilePath: \smanga-adonis\start\routes.ts
 */
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
const LastreadsController = () => import('#controllers/lastreads_controller')
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

import prisma from '#start/prisma'

router.get('/', async () => {
  return {
    hello: 'world',
  }
})


router.get('/test', async () => {
  const pathInfo = await prisma.path.findMany({
    where: { pathId: 1 },
    include: {
      media: true,
    },
  })
  return pathInfo
})

router.any('/image', [ImagesController, 'index'])

// 收藏模块 collect
router.get('/collect', [CollectsController, 'index'])
router.get('/collect/:collectId', [CollectsController, 'show'])
router.post('/collect', [CollectsController, 'create'])
router.patch('/collect/:collectId', [CollectsController, 'update'])
router.delete('/collect/:collectId', [CollectsController, 'destroy'])
router.get('/manga-collect/:mangaId', [CollectsController, 'is_collect'])

// 书签
router.get('/bookmark', [BookmarksController, 'index'])
router.get('/bookmark/:bookmarkId', [BookmarksController, 'show'])
router.post('/bookmark', [BookmarksController, 'create'])
router.patch('/bookmark/:bookmarkId', [BookmarksController, 'update'])
router.delete('/bookmark/:bookmarkId', [BookmarksController, 'destroy'])

// 压缩模块 compress
router.get('/compress', [CompressesController, 'index'])
router.get('/compress/:compressId', [CompressesController, 'show'])
router.post('/compress', [CompressesController, 'create'])
router.patch('/compress/:compressId', [CompressesController, 'update'])
router.delete('/compress/:compressId', [CompressesController, 'destroy'])

// 历史记录模块 history
router.get('/history', [HistoriesController, 'index'])
router.get('/history/:historyId', [HistoriesController, 'show'])
router.post('/history', [HistoriesController, 'create'])
router.patch('/history/:historyId', [HistoriesController, 'update'])
router.delete('/history/:historyId', [HistoriesController, 'destroy'])

// 最后阅读记录 lastread
router.get('/lastread', [LastreadsController, 'index'])
router.get('/lastread/:lastReadId', [LastreadsController, 'show'])
router.post('/lastread', [LastreadsController, 'create'])
router.patch('/lastread/:lastReadId', [LastreadsController, 'update'])
router.delete('/lastread/:lastReadId', [LastreadsController, 'destroy'])

// 最后阅读记录 latest
router.get('/latest', [LatestsController, 'index'])
router.get('/latest/:mangaId', [LatestsController, 'show'])
router.post('/latest', [LatestsController, 'create'])
router.patch('/latest/:latestId', [LatestsController, 'update'])
router.delete('/latest/:latestId', [LatestsController, 'destroy'])

// 日志模块 log
router.get('/log', [LogsController, 'index'])
router.get('/log/:logId', [LogsController, 'show'])
router.post('/log', [LogsController, 'create'])
router.patch('/log/:logId', [LogsController, 'update'])
router.delete('/log/:logId', [LogsController, 'destroy'])

// 登录记录 login
router.get('/login', [LoginController, 'index'])
router.get('/login/:loginId', [LoginController, 'show'])
router.post('/login', [LoginController, 'create'])
router.patch('/login/:loginId', [LoginController, 'update'])
router.delete('/login/:loginId', [LoginController, 'destroy'])

// 任务
router.get('/tasks', [TasksController, 'index'])
router.get('/tasks/:taskId', [TasksController, 'show'])
router.post('/tasks', [TasksController, 'create'])
router.patch('/tasks/:taskId', [TasksController, 'update'])
router.delete('/tasks/:taskId', [TasksController, 'destroy'])

// 媒体库
router.get('/media', [MediaController, 'index'])
router.get('/media/:mediaId', [MediaController, 'show'])
router.post('/media', [MediaController, 'create'])
router.patch('/media/:mediaId', [MediaController, 'update'])
router.delete('/media/:mediaId', [MediaController, 'destroy'])

// 路径
router.get('/path', [PathsController, 'index'])
router.get('/path/:pathId', [PathsController, 'show'])
router.post('/path', [PathsController, 'create'])
router.patch('/path/:pathId', [PathsController, 'update'])
router.delete('/path/:pathId', [PathsController, 'destroy'])
router.put('/path/scan/:pathId', [PathsController, 'scan'])

// 标签
router.get('/tag', [TagsController, 'index'])
router.get('/tag/:tagId', [TagsController, 'show'])
router.post('/tag', [TagsController, 'create'])
router.patch('/tag/:tagId', [TagsController, 'update'])
router.put('/tag/:tagId', [TagsController, 'update'])
router.delete('/tag/:tagId', [TagsController, 'destroy'])
router.get('/manga-tag', [MangaTagController, 'index'])
router.post('/manga-tag', [MangaTagController, 'create'])
router.delete('/manga-tag', [MangaTagController, 'destroy'])

// 漫画
router.get('/manga', [MangaController, 'index'])
router.get('/manga/:mangaId', [MangaController, 'show'])
router.post('/manga', [MangaController, 'create'])
router.patch('/manga/:mangaId', [MangaController, 'update'])
router.delete('/manga/:mangaId', [MangaController, 'destroy'])

// 章节
router.get('/chapter', [chaptersController, 'index'])
router.get('/chapter/:chapterId', [chaptersController, 'show'])
router.post('/chapter', [chaptersController, 'create'])
router.patch('/chapter/:chapterId', [chaptersController, 'update'])
router.delete('/chapter/:chapterId', [chaptersController, 'destroy'])
router.get('/chapter-images/:chapterId', [chaptersController, 'images'])
router.get('/chapter-first', [chaptersController, 'first'])

// 用户
router.get('/user', [UsersController, 'index'])
router.get('/user/:userId', [UsersController, 'show'])
router.post('/user', [UsersController, 'create'])
router.patch('/user/:userId', [UsersController, 'update'])
router.delete('/user/:userId', [UsersController, 'destroy'])
