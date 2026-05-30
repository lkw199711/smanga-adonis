import type { HttpContext } from '@adonisjs/core/http'
import ScanReportService from '#services/scan/scan_report_service'
import {
  idParamScanRunValidator,
  listScanRunItemValidator,
  listScanRunValidator,
} from '#validators/scan_run'

export default class ScanRunsController {
  private reportService = new ScanReportService()

  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  public async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const query = await listScanRunValidator.validate(request.qs())
    const { list, count } = await this.reportService.listRuns(query)
    return response.json({ code: 200, message: '', list, count })
  }

  public async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { scanRunId } = await idParamScanRunValidator.validate(params)
    const scanRun = await this.reportService.getRun(scanRunId)
    if (!scanRun) {
      return response.status(404).json({ code: 404, message: '扫描报告不存在' })
    }
    return response.json({ code: 200, message: '', data: scanRun })
  }

  public async items({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { scanRunId } = await idParamScanRunValidator.validate(params)
    const query = await listScanRunItemValidator.validate(request.qs())
    const { list, count } = await this.reportService.listItems({ scanRunId, ...query })
    return response.json({ code: 200, message: '', list, count })
  }
}
