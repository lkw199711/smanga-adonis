import { countActiveScanChildren } from '#services/queue/sql_queue_repository'
import ScanReportService from '#services/scan/scan_report_service'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default class FinalizeScanRunJob {
  private reportService = new ScanReportService()

  constructor(
    private args: {
      scanRunId?: number
      expectedTasks?: number
      summary?: Record<string, unknown>
    }
  ) {}

  async run() {
    const scanRunId = this.args.scanRunId
    if (!scanRunId) return
    const expectedTasks = this.args.expectedTasks || 0
    const deadline = Date.now() + 10 * 60 * 1000

    while (Date.now() < deadline) {
      const [activeChildren, progress] = await Promise.all([
        countActiveScanChildren(scanRunId),
        this.reportService.childProgress(scanRunId),
      ])

      if (activeChildren === 0 && progress.completed + progress.failed >= expectedTasks) {
        const summary = {
          ...(this.args.summary || {}),
          expectedTasks,
          completedTasks: progress.completed,
          failedTasks: progress.failed,
        }
        if (progress.failed > 0) {
          await this.reportService.finishFailed(
            scanRunId,
            `${progress.failed} 个漫画扫描任务失败`,
            summary
          )
        } else {
          await this.reportService.finishSuccess(scanRunId, summary, '扫描任务全部完成')
        }
        return
      }

      await sleep(500)
    }

    throw new Error(`等待漫画扫描子任务完成超时（expected=${expectedTasks}）`)
  }
}
