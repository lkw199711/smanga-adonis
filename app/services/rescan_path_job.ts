import prisma from '#start/prisma'
import DeleteMangaJob from './delete_manga_job.js'
import ScanPathJob from './scan_job.js'
import ScanReportService from './scan/scan_report_service.js'

export default class RescanPathJob {
  private reportService = new ScanReportService()

  constructor(private args: { pathId: number; scanRunId?: number }) {}

  async run() {
    await this.reportService.markRunning(this.args.scanRunId)
    const pathRecord = await prisma.path.findUnique({ where: { pathId: this.args.pathId } })
    if (!pathRecord) throw new Error(`路径 ${this.args.pathId} 不存在`)

    const mangas = await prisma.manga.findMany({
      where: { pathId: this.args.pathId },
      select: { mangaId: true },
    })
    for (const manga of mangas) {
      await new DeleteMangaJob({ mangaId: manga.mangaId }).run()
    }

    await new ScanPathJob(this.args).run()
  }
}
