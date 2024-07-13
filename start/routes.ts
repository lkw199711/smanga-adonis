/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-06-20 19:41:31
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-06-20 20:34:53
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

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router.get('users', [UsersController, 'index'])