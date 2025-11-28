import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
export default class ParamsMiddleware {
  async handle({ request }: HttpContext, next: NextFn) {
    const parseKeys = ['page', 'pageSize', 'limit', 'slice']
    // 处理 query 参数
    const queryParams = request.qs()
    for (const key in queryParams) {
      if (key.toLowerCase().endsWith('id') || parseKeys.includes(key)) {
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
      if (key.toLowerCase().endsWith('id') || parseKeys.includes(key)) {
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
        if (key.toLowerCase().endsWith('id') || parseKeys.includes(key)) {
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
      if (key.toLowerCase().endsWith('id') || parseKeys.includes(key)) {
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
