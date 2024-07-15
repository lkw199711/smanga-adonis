/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-06-20 19:41:31
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-07-15 19:00:43
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

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// 收藏模块 collect
router.get('/collect', [CollectsController, 'index'])
router.get('/collect/:collectId', [CollectsController, 'show'])
router.post('/collect', [CollectsController, 'create'])
router.patch('/collect/:collectId', [CollectsController, 'update'])
router.delete('/collect/:collectId', [CollectsController, 'destroy'])

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

// 最后阅读记录 lastread
router.get('/latest', [LatestsController, 'index'])
router.get('/latest/:latestId', [LatestsController, 'show'])
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

router.get('users', [UsersController, 'index'])
