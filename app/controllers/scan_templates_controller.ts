import type { HttpContext } from '@adonisjs/core/http'
import { METADATA_PROFILES, listConcreteScanTemplates } from '#services/scan/scan_template_service'
import { SCAN_ENGINES } from '#services/scan/scan_types'
import { resolveScanEngine } from '#services/scan/scan_config_service'

export default class ScanTemplatesController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    return response.json({
      code: 200,
      message: '',
      data: {
        defaultTemplateKey: 'auto',
        activeEngine: resolveScanEngine(),
        engines: SCAN_ENGINES,
        configVersion: 1,
        legacyTemplate: {
          key: 'legacy',
          label: '兼容旧媒体库设置',
          pattern: 'legacy',
        },
        templates: [
          {
            key: 'auto',
            label: '自动推荐',
            pattern: 'auto',
          },
          {
            key: 'custom',
            label: '自定义模板规则',
            pattern: 'custom',
          },
          ...listConcreteScanTemplates(),
        ],
        metadataProfiles: METADATA_PROFILES,
      },
    })
  }
}
