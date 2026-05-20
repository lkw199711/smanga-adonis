/*
 * @Author: 梁杭森 lkw199711@163.com
 * @Date: 2024-06-20 19:41:31
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-03-13 19:26:15
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
import { get_os } from '#utils/index'

server.errorHandler(() => import('#exceptions/handler'))

server.use([
  () => import('#middleware/container_bindings_middleware'),
  () => import('#middleware/force_json_response_middleware'),
  () => import('@adonisjs/cors/cors_middleware'),
])

router.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/auth/initialize_auth_middleware'),
  () => import('#middleware/request_log_middleware'),
  () => import('#middleware/params_middleware'),
  () => import('#middleware/auth_middleware'),
  () => import('#middleware/tracker_auth_middleware'),
  () => import('#middleware/p2p_peer_auth_middleware'),
])

const os = get_os()
if (os === 'Windows') {
  await database_check()
}

await init()