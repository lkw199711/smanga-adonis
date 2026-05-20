import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import { Prisma } from '@prisma/client'
import {
  listLogValidator,
  idParamLogValidator,
  summaryLogValidator,
  cleanupLogValidator,
} from '#validators/log'

function parseJsonField(value: unknown) {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeLogItem<T extends Record<string, any>>(item: T): T {
  return {
    ...item,
    context: parseJsonField(item.context),
    device: parseJsonField(item.device),
    exception: parseJsonField(item.exception),
  }
}

function hitRequestId(logItem: Record<string, any>, requestId: string): boolean {
  const context = logItem.context
  if (!context) {
    return false
  }

  if (typeof context === 'string') {
    return context.includes(requestId)
  }

  return String(context.requestId || '').includes(requestId)
}

export default class LogsController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || user.role !== 'admin') {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  public async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const {
      page,
      pageSize,
      logType,
      logLevel,
      module,
      queue,
      userId,
      keyword,
      requestId,
      from,
      to,
    } = await listLogValidator.validate(request.qs())

    const where: Prisma.logWhereInput = {
      ...(logType ? { logType } : {}),
      ...(typeof logLevel === 'number' ? { logLevel } : {}),
      ...(module ? { module } : {}),
      ...(queue ? { queue } : {}),
      ...(typeof userId === 'number' ? { userId } : {}),
      ...((from || to)
        ? {
            createTime: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      ...(keyword
        ? {
            OR: [
              { message: { contains: keyword } },
              { exception: { contains: keyword } },
            ],
          }
        : {}),
    }

    const orderBy = [
      { createTime: Prisma.SortOrder.desc },
      { logId: Prisma.SortOrder.desc },
    ]

    const currentPage = page ?? 1
    const currentPageSize = pageSize ?? 20

    if (requestId) {
      const allRows = await prisma.log.findMany({
        where,
        orderBy,
      })

      const normalized = allRows.map((item) => normalizeLogItem(item as any))
      const filtered = normalized.filter((item) => hitRequestId(item, requestId))
      const start = (currentPage - 1) * currentPageSize
      const list = filtered.slice(start, start + currentPageSize)

      return response.json({
        code: 200,
        message: '',
        list,
        count: filtered.length,
      })
    }

    const queryParams = {
      where,
      skip: (currentPage - 1) * currentPageSize,
      take: currentPageSize,
      orderBy,
    }

    const [list, count] = await Promise.all([
      prisma.log.findMany(queryParams),
      prisma.log.count({ where }),
    ])

    return response.json({
      code: 200,
      message: '',
      list: list.map((item) => normalizeLogItem(item as any)),
      count,
    })
  }

  public async show({ request, params, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { logId } = await idParamLogValidator.validate(params)
    const data = await prisma.log.findUnique({ where: { logId } })
    return response.json({
      code: 200,
      message: '',
      data: data ? normalizeLogItem(data as any) : data,
    })
  }

  public async summary({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { hours } = await summaryLogValidator.validate(request.qs())
    const lookbackHours = Math.min(hours ?? 24, 24 * 30)
    const from = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)

    const [warnCount, errorCount, moduleRows, latestFailedTasks] = await Promise.all([
      prisma.log.count({
        where: {
          createTime: { gte: from },
          logLevel: 2,
        },
      }),
      prisma.log.count({
        where: {
          createTime: { gte: from },
          logLevel: { gte: 3 },
        },
      }),
      prisma.log.groupBy({
        by: ['module'],
        where: {
          createTime: { gte: from },
          logLevel: { gte: 2 },
          module: { not: null },
        },
        _count: { _all: true },
        orderBy: {
          _count: {
            module: 'desc',
          },
        },
        take: 10,
      }),
      prisma.log.findMany({
        where: {
          createTime: { gte: from },
          OR: [
            { logType: 'queue' },
            { module: 'queue' },
          ],
          logLevel: { gte: 3 },
        },
        orderBy: [{ createTime: 'desc' }],
        take: 10,
      }),
    ])

    return response.json({
      code: 200,
      message: '',
      data: {
        from: from.toISOString(),
        hours: lookbackHours,
        warnCount,
        errorCount,
        modules: moduleRows.map((row) => ({
          module: row.module,
          count: row._count?._all || 0,
        })),
        latestFailedTasks: latestFailedTasks.map((item) => normalizeLogItem(item as any)),
      },
    })
  }

  public async cleanup({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { before } = await cleanupLogValidator.validate(request.qs())
    const beforeDate = before ? new Date(before) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    if (Number.isNaN(beforeDate.getTime())) {
      return response.status(400).json({
        code: 400,
        message: 'invalid before date',
      })
    }

    const result = await prisma.log.deleteMany({
      where: {
        createTime: {
          lt: beforeDate,
        },
      },
    })

    return response.json({
      code: 200,
      message: 'cleanup completed',
      data: {
        before: beforeDate.toISOString(),
        deletedCount: result.count,
      },
    })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    return response.status(405).json({
      code: 405,
      message: '系统日志不允许手动创建',
      status: 'method_not_allowed',
    })
  }

  public async update({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    return response.status(405).json({
      code: 405,
      message: '系统日志不允许手动更新',
      status: 'method_not_allowed',
    })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { logId } = await idParamLogValidator.validate(params)
    const deleted = await prisma.log.delete({ where: { logId } })
    return response.json({ code: 200, message: '删除成功', data: deleted })
  }
}
