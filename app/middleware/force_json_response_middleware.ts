import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { isApiPath } from '#utils/http_path'

/**
 * Updating the "Accept" header to always accept "application/json" response
 * from the server. This will force the internals of the framework like
 * validator errors or auth errors to return a JSON response.
 */
export default class ForceJsonResponseMiddleware {
  async handle({ request }: HttpContext, next: NextFn) {
    if (!isApiPath(request.url())) {
      return next()
    }

    const headers = request.headers()
    headers.accept = 'application/json'

    return next()
  }
}
