import prisma from '#start/prisma'
import { get_config } from '#utils/index'
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
          scan: get_config()?.scan || {},
          path: pathConfig,
        }),
      },
    })
    return run
  }

  async markRunning(scanRunId?: number | null) {
    if (!scanRunId) return
    await this.client.scanRun.update({
      where: { scanRunId },
      data: { status: 'running', startedAt: new Date() },
    })
  }

  async appendItems(scanRunId: number | null | undefined, items: ScanReportItem[]) {
    if (!scanRunId || !items.length) return

    const existingCount = await this.client.scanRunItem.count({ where: { scanRunId } })
    const slots = Math.max(MAX_ITEMS - existingCount, 0)
    const data = items.slice(0, slots).map((item) => ({
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

    if (items.length > slots) {
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

  async finishSuccess(scanRunId: number | null | undefined, summary: object, message?: string) {
    if (!scanRunId) return
    await this.client.scanRun.update({
      where: { scanRunId },
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
    await this.client.scanRun.update({
      where: { scanRunId },
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
