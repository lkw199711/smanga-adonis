/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 07:42:48
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-06 20:27:41
 * @FilePath: \smanga-adonis\app\middleware\params_middleware.ts
 */
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
export default class ParamsMiddleware {
  async handle({ request }: HttpContext, next: NextFn) {
    // 处理 query 参数
    const queryParams = request.qs()
    for (const key in queryParams) {
      if (key.toLowerCase().endsWith('id') || key === 'page' || key === 'pageSize') {
        const value = queryParams[key]
        const convertedValue = Number(value)
        if (!isNaN(convertedValue)) {
          queryParams[key] = convertedValue
        }
      }
    }
    request.updateQs(queryParams)

    // 处理 body 参数
    const bodyParams = request.body()
    for (const key in bodyParams) {
      if (key.toLowerCase().endsWith('id') || key === 'page' || key === 'pageSize') {
        const value = bodyParams[key]
        const convertedValue = Number(value)
        if (!isNaN(convertedValue)) {
          bodyParams[key] = convertedValue
        }
      }
    }

    if (bodyParams.data && typeof bodyParams.data === 'object') {
      const data = bodyParams.data
      for (const key in data) {
        if (key.toLowerCase().endsWith('id') || key === 'page' || key === 'pageSize') {
          const value = data[key]
          const convertedValue = Number(value)
          if (!isNaN(convertedValue)) {
            data[key] = convertedValue
          }
        }
      }
    }
    request.updateBody(bodyParams)

    // 处理路径参数
    const pathParams = request.params()
    for (const key in pathParams) {
      if (key.toLowerCase().endsWith('id')) {
        const value = pathParams[key]
        const convertedValue = Number(value)
        if (!isNaN(convertedValue)) {
          pathParams[key] = convertedValue
        }
      }
    }
    Object.assign(request.params(), pathParams)

    /**
     * Call next method in the pipeline and return its output
     */
    const output = await next()
    return output
  }
}
