/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-06-20 19:41:31
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-03 23:28:39
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
import TaskProcess from '#services/task_service'
import clear_scan from '#services/clear_scan_service'
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
])

/**
 * Named middleware collection must be explicitly assigned to
 * the routes or the routes group.
 */
export const middleware = router.named({
  auth: () => import('#middleware/auth_middleware'),
})

/*
|--------------------------------------------------------------------------
| 启动任务处理器
|--------------------------------------------------------------------------
|
| 在项目启动时自动运行任务处理器
|
*/

// 初始化方法 检查根目录以及配置文件
init()

// 启动任务队列处理器
let period = 0
const taskProcess = new TaskProcess()

setInterval(() => {
  // 每个周期执行
  taskProcess.handleTaskQueue()
  // 每十个周期执行
  if (period % 10) {
    clear_scan()
  }
  period ++
}, 1000)
