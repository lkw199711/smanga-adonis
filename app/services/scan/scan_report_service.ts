import prisma from '#start/prisma'
import { get_config } from '#utils/index'
import { resolveScanEngine } from './scan_config_service.js'
import type { ScanReportItem } from './scan_types.js'

const MAX_ITEMS = 2000

export default class ScanReportService {
  private client = prisma as any

  async createRun(input: {
    runType: string
    triggerType: string
    mediaId?: number | null
    pathId?: number | null
    pathContent?: string | null
    status?: string
    message?: string
  }) {
    const pathConfig = input.pathId
      ? await this.client.path.findUnique({
          where: { pathId: input.pathId },
          select: {
            scanTemplateKey: true,
            scanTemplateConfig: true,
            metadataProfileKey: true,
            metadataProfileConfig: true,
            include: true,
            exclude: true,
          },
        })
      : null

    const run = await this.client.scanRun.create({
      data: {
        runType: input.runType,
        triggerType: input.triggerType,
        status: input.status || 'pending',
        mediaId: input.mediaId,
        pathId: input.pathId,
        pathContent: input.pathContent,
        message: input.message,
        configSnapshot: JSON.stringify({
          engine: resolveScanEngine(),
          scan: get_config()?.scan || {},
          path: pathConfig,
        }),
      },
    })
    return run
  }

  async markRunning(scanRunId?: number | null) {
    if (!scanRunId) return
    await this.client.scanRun.updateMany({
      where: { scanRunId, status: 'pending' },
      data: { status: 'running', startedAt: new Date() },
    })
  }

  async appendItems(scanRunId: number | null | undefined, items: ScanReportItem[]) {
    if (!scanRunId || !items.length) return

    const existingCount = await this.client.scanRunItem.count({ where: { scanRunId } })
    const slots = Math.max(MAX_ITEMS - existingCount, 0)
    const truncated = items.length > slots
    const itemSlots = truncated ? Math.max(slots - 1, 0) : slots
    const data = items.slice(0, itemSlots).map((item) => ({
      scanRunId,
      level: item.level,
      category: item.category,
      targetType: item.targetType,
      action: item.action,
      reasonCode: item.reasonCode,
      reason: item.reason,
      targetName: item.targetName,
      targetPath: item.targetPath,
      extraJson: item.extra ? JSON.stringify(item.extra) : null,
    }))

    if (data.length) {
      await this.client.scanRunItem.createMany({ data })
    }

    if (truncated && slots > 0) {
      await this.client.scanRunItem.create({
        data: {
          scanRunId,
          level: 'warning',
          category: 'warning',
          targetType: 'path',
          reasonCode: 'REPORT_TRUNCATED',
          reason: `报告明细过多，仅保存前 ${MAX_ITEMS} 条`,
        },
      })
    }
  }

  async recordMangaCompleted(
    scanRunId: number | null | undefined,
    mangaName: string,
    mangaPath: string
  ) {
    if (!scanRunId) return
    const exists = await this.client.scanRunItem.findFirst({
      where: { scanRunId, reasonCode: 'MANGA_SCAN_COMPLETED', targetPath: mangaPath },
    })
    if (exists) return
    await this.client.$transaction([
      this.client.scanRun.update({
        where: { scanRunId },
        data: { completedTasks: { increment: 1 } },
      }),
      this.client.scanRunItem.create({
        data: {
          scanRunId,
          level: 'info',
          category: 'summary',
          targetType: 'manga',
          action: 'update',
          reasonCode: 'MANGA_SCAN_COMPLETED',
          reason: '漫画扫描任务完成',
          targetName: mangaName,
          targetPath: mangaPath,
        },
      }),
    ])
  }

  async recordMangaFailed(
    scanRunId: number | null | undefined,
    mangaName: string | undefined,
    mangaPath: string | undefined,
    error: unknown
  ) {
    if (!scanRunId) return
    const targetPath = mangaPath || `unknown:${mangaName || 'manga'}`
    const exists = await this.client.scanRunItem.findFirst({
      where: { scanRunId, reasonCode: 'MANGA_SCAN_FAILED', targetPath },
    })
    if (exists) return
    await this.client.$transaction([
      this.client.scanRun.update({
        where: { scanRunId },
        data: { failedTasks: { increment: 1 } },
      }),
      this.client.scanRunItem.create({
        data: {
          scanRunId,
          level: 'error',
          category: 'error',
          targetType: 'manga',
          action: 'none',
          reasonCode: 'MANGA_SCAN_FAILED',
          reason: error instanceof Error ? error.message : String(error),
          targetName: mangaName,
          targetPath,
        },
      }),
    ])
  }

  async childProgress(scanRunId: number) {
    const run = await this.client.scanRun.findUnique({
      where: { scanRunId },
      select: { expectedTasks: true, completedTasks: true, failedTasks: true },
    })
    return {
      expected: run?.expectedTasks || 0,
      completed: run?.completedTasks || 0,
      failed: run?.failedTasks || 0,
    }
  }

  async mangaOutcomePaths(scanRunId: number | null | undefined) {
    if (!scanRunId) return new Set<string>()
    const items = await this.client.scanRunItem.findMany({
      where: {
        scanRunId,
        reasonCode: { in: ['MANGA_SCAN_COMPLETED', 'MANGA_SCAN_FAILED'] },
        targetPath: { not: null },
      },
      select: { targetPath: true },
    })
    return new Set<string>(items.map((item: { targetPath: string }) => item.targetPath))
  }

  async setExpectedTasks(scanRunId: number | null | undefined, expectedTasks: number) {
    if (!scanRunId) return
    await this.client.scanRun.update({
      where: { scanRunId },
      data: { expectedTasks },
    })
  }

  async finishSuccess(scanRunId: number | null | undefined, summary: object, message?: string) {
    if (!scanRunId) return
    await this.client.scanRun.updateMany({
      where: { scanRunId, status: { in: ['pending', 'running'] } },
      data: {
        status: 'success',
        summaryJson: JSON.stringify(summary),
        message,
        finishedAt: new Date(),
      },
    })
  }

  async finishFailed(scanRunId: number | null | undefined, error: unknown, summary?: object) {
    if (!scanRunId) return
    await this.client.scanRun.updateMany({
      where: { scanRunId, status: { in: ['pending', 'running'] } },
      data: {
        status: 'failed',
        summaryJson: summary ? JSON.stringify(summary) : undefined,
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      },
    })
  }

  async listRuns(query: {
    page?: number
    pageSize?: number
    pathId?: number
    mediaId?: number
    status?: 'pending' | 'running' | 'success' | 'failed'
  }) {
    const page = query.page || 1
    const pageSize = query.pageSize || 20
    const where = {
      ...(query.pathId && { pathId: query.pathId }),
      ...(query.mediaId && { mediaId: query.mediaId }),
      ...(query.status && { status: query.status }),
    }

    const [list, count] = await Promise.all([
      this.client.scanRun.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createTime: 'desc' },
      }),
      this.client.scanRun.count({ where }),
    ])

    return { list, count }
  }

  async getRun(scanRunId: number) {
    return this.client.scanRun.findUnique({ where: { scanRunId } })
  }

  async listItems(query: {
    scanRunId: number
    page?: number
    pageSize?: number
    level?: string
    category?: string
  }) {
    const page = query.page || 1
    const pageSize = query.pageSize || 100
    const where = {
      scanRunId: query.scanRunId,
      ...(query.level && { level: query.level }),
      ...(query.category && { category: query.category }),
    }

    const [list, count] = await Promise.all([
      this.client.scanRunItem.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { scanRunItemId: 'asc' },
      }),
      this.client.scanRunItem.count({ where }),
    ])

    return { list, count }
  }
}

export async function handleScanQueueTerminalFailure(
  command: string,
  args: Record<string, any> | null | undefined,
  error: unknown
) {
  const scanRunId = Number(args?.scanRunId || 0)
  if (!scanRunId) return
  const service = new ScanReportService()
  if (command === 'taskScanManga') {
    await service.recordMangaFailed(scanRunId, args?.mangaName, args?.mangaPath, error)
    return
  }
  await service.finishFailed(scanRunId, error)
}
