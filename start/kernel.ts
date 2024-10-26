/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-06-20 19:41:31
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-15 16:22:05
 * @FilePath: \smanga-adonis\start\kernel.ts
 */
/*
|--------------------------------------------------------------------------
| HTTP kernel file
|--------------------------------------------------------------------------
|
| The HTTP kernel file is used to register the middleware with the server
| or the router.
|
*/

import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'
import database_check from '../app/services/database_check_service.js'
import init from './init.js'

/**
 * The error handler is used to convert an exception
 * to a HTTP response.
 */
server.errorHandler(() => import('#exceptions/handler'))

/**
 * The server middleware stack runs middleware on all the HTTP
 * requests, even if there is no route registered for
 * the request URL.
 */
server.use([
  () => import('#middleware/container_bindings_middleware'),
  () => import('#middleware/force_json_response_middleware'),
  () => import('@adonisjs/cors/cors_middleware'),
])
/**
 * The router middleware stack runs middleware on all the HTTP
 * requests with a registered route.
 */
router.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/auth/initialize_auth_middleware'),
  () => import('#middleware/params_middleware'),
  () => import('#middleware/auth_middleware'),
])

/*
|--------------------------------------------------------------------------
| 启动任务处理器
|--------------------------------------------------------------------------
|
| 在项目启动时自动运行任务处理器
|
*/

// 初始化数据库
await database_check()

// 项目启动初始化
await init()
