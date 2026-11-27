import prisma from '#start/prisma'
import type { Prisma } from '@prisma/client'
import { TaskPriority } from '#type/index'
import { sql_parse_json } from '#utils/index'
import { getQueueConfig, getQueueName } from './queue_config.js'

type QueueJobRecord = {
  id: number
  queue_name: string
  task_queue: string
  task_name: string
  command: string
  args: any
  status: string
  priority: number
  attempts_made: number
  max_attempts: number
  timeout_ms: number
  available_at: Date
  locked_by?: string | null
  locked_until?: Date | null
  started_at?: Date | null
  last_error?: string | null
  created_at: Date
  updated_at: Date
}

type EnqueueJobInput = {
  taskQueue: string
  taskName: string
  command: string
  args: any
  priority?: number
  timeout?: number
}

type ClaimInput = {
  workerId: string
  taskQueues: string[]
  stalledAfterMs: number
}

const db = prisma as any

function encodeJson(value: any) {
  return sql_parse_json(value ?? {})
}

export function decodeJson(value: any) {
  if (typeof value !== 'string') return value ?? null
  try {
    return JSON.parse(value)
  } catch (_) {
    return value
  }
}

function normalizeStates(states?: string[]) {
  if (!states?.length) return ['pending', 'running']
  return states.map((state) => {
    if (state === 'waiting') return 'pending'
    if (state === 'active') return 'running'
    return state
  })
}

export function toJobLike(job: QueueJobRecord | null) {
  if (!job) return null

  return {
    id: String(job.id),
    name: job.task_queue,
    data: {
      taskName: job.task_name,
      command: job.command,
      args: decodeJson(job.args),
    },
    queue: { name: job.task_queue },
    opts: {
      priority: job.priority,
      timeout: job.timeout_ms,
      attempts: job.max_attempts,
    },
    attemptsMade: job.attempts_made,
    status: job.status,
    canRemove: job.status === 'pending' && !libraryDeletionCommands.includes(job.command),
    timestamp: job.created_at?.getTime?.() ?? Date.now(),
    processedOn: job.started_at?.getTime?.() ?? null,
    failedReason: job.last_error,
    remove: async () => removeJob(job.id),
  }
}

export async function enqueueJob(input: EnqueueJobInput) {
  const config = getQueueConfig()
  const job = await db.queue_job.create({ data: queueJobData(input, config) })

  return toJobLike(job)
}

export function queueJobData(input: EnqueueJobInput, config = getQueueConfig()) {
  return {
    queue_name: getQueueName(),
    task_queue: input.taskQueue,
    task_name: input.taskName,
    command: input.command,
    args: encodeJson(input.args) as Prisma.queue_jobCreateManyInput['args'],
    status: 'pending',
    priority: input.priority ?? 10,
    attempts_made: 0,
    max_attempts: config.attempts,
    timeout_ms: input.timeout ?? config.timeout,
    available_at: new Date(),
  }
}

/**
 * 在串行化事务内完成“检查路径是否繁忙 + 入队”，避免两个并发请求都通过预检查。
 * 根任务运行期间会一直存在；根任务退出前已创建的漫画子任务/收尾任务继续通过
 * scan_path_{pathId}_ 前缀保持路径繁忙状态。
 */
export async function enqueuePathJobIfIdle(pathId: number, input: EnqueueJobInput) {
  const queueName = getQueueName()
  const taskPrefix = `scan_path_${pathId}`
  try {
    const job = await db.$transaction(
      async (tx: any) => {
        const active = await tx.queue_job.count({
          where: {
            queue_name: queueName,
            OR: [{ task_name: taskPrefix }, { task_name: { startsWith: `${taskPrefix}_` } }],
            status: { in: ['pending', 'running'] },
          },
        })
        if (active > 0) return null
        return tx.queue_job.create({ data: queueJobData(input) })
      },
      { isolationLevel: 'Serializable' }
    )
    return toJobLike(job)
  } catch (error: any) {
    // Prisma 在并发串行化冲突时会让其中一个事务回滚；此时按重复扫描处理。
    if (error?.code === 'P2034') return null
    throw error
  }
}

export async function enqueueNamedJobIfIdle(input: EnqueueJobInput) {
  const queueName = getQueueName()
  try {
    const job = await db.$transaction(
      async (tx: any) => {
        const active = await tx.queue_job.count({
          where: {
            queue_name: queueName,
            task_name: input.taskName,
            status: { in: ['pending', 'running'] },
          },
        })
        if (active > 0) return null
        return tx.queue_job.create({ data: queueJobData(input) })
      },
      { isolationLevel: 'Serializable' }
    )
    return toJobLike(job)
  } catch (error: any) {
    if (error?.code === 'P2034') return null
    throw error
  }
}

export async function listJobs(states?: string[]) {
  const jobs = await db.queue_job.findMany({
    where: {
      queue_name: getQueueName(),
      status: { in: normalizeStates(states) },
    },
    orderBy: [{ priority: 'asc' }, { id: 'asc' }],
  })

  return jobs.map((job: QueueJobRecord) => toJobLike(job))
}

export async function getJob(id: string | number) {
  const jobId = Number(id)
  if (!Number.isFinite(jobId)) return null

  const job = await db.queue_job.findFirst({
    where: {
      id: jobId,
      queue_name: getQueueName(),
    },
  })

  return toJobLike(job)
}

export async function removeJob(id: string | number) {
  const jobId = Number(id)
  if (!Number.isFinite(jobId)) return false

  const result = await db.queue_job.deleteMany({
    where: { id: jobId, ...removableJobs() },
  })

  return result.count > 0
}

const libraryDeletionCommands = ['deleteMedia', 'deletePath', 'deleteManga', 'deleteChapter', 'deleteLibraryFile']

export type LibraryDeletionKind = 'media' | 'path' | 'manga' | 'chapter'
type LibraryDeletionScope = Partial<Record<`${LibraryDeletionKind}Id`, number>>
type ScopedDeletion = { kind: LibraryDeletionKind; scope: LibraryDeletionScope }

export async function activeLibraryDeletionScopes(tx: Prisma.TransactionClient): Promise<ScopedDeletion[]> {
  const jobs = await tx.queue_job.findMany({
    where: {
      queue_name: getQueueName(),
      status: { in: ['pending', 'running'] },
      command: { in: libraryDeletionCommands },
      task_name: { endsWith: '_purge' },
    },
    select: { args: true },
  })
  return jobs.map(job => decodeJson(job.args)).filter(args => args?.kind && args.scope)
}

export function libraryDeletionOverlaps(request: ScopedDeletion, queued: ScopedDeletion) {
  const requestId = `${request.kind}Id` as const
  const queuedId = `${queued.kind}Id` as const
  return (request.scope[queuedId] !== undefined && request.scope[queuedId] === queued.scope[queuedId]) ||
    (queued.scope[requestId] !== undefined && queued.scope[requestId] === request.scope[requestId])
}

function removableJobs() {
  return { queue_name: getQueueName(), status: 'pending', command: { notIn: libraryDeletionCommands } }
}

export async function cleanJobs(states?: string[]) {
  if (!normalizeStates(states).includes('pending')) return 0
  const result = await db.queue_job.deleteMany({ where: removableJobs() })
  return result.count
}

export async function listFailedDeletions() {
  const jobs = await db.queue_failed_job.findMany({
    where: { queue_name: getQueueName(), command: { in: libraryDeletionCommands } },
    orderBy: { id: 'desc' },
  })
  return jobs.map((job: any) => toJobLike({
    ...job, status: 'failed', priority: 0, timeout_ms: 0, last_error: job.error,
  }))
}

async function setManualItemDeletionFlag(
  tx: Prisma.TransactionClient,
  job: Pick<QueueJobRecord, 'command' | 'args'>,
  deleteFlag: 0 | 1
) {
  const args = decodeJson(job.args)
  if (!args?.purge) return
  if (job.command === 'deleteManga' && Number.isSafeInteger(args.mangaId) && args.mangaId > 0) {
    await tx.manga.updateMany({ where: { mangaId: args.mangaId }, data: { deleteFlag } })
  } else if (job.command === 'deleteChapter' && Number.isSafeInteger(args.chapterId) && args.chapterId > 0) {
    await tx.chapter.updateMany({ where: { chapterId: args.chapterId }, data: { deleteFlag } })
  }
}

export async function retryFailedDeletion(id: number) {
  const config = getQueueConfig()
  return db.$transaction(async (tx: any) => {
    const failed = await tx.queue_failed_job.findFirst({
      where: { id, queue_name: getQueueName(), command: { in: libraryDeletionCommands } },
    })
    if (!failed) return null
    const existing = await tx.queue_job.findFirst({
      where: {
        queue_name: failed.queue_name,
        task_name: failed.task_name,
        status: { in: ['pending', 'running'] },
      },
    })
    const args = decodeJson(failed.args)
    if (!existing && args?.kind && args.scope) {
      const scopes = await activeLibraryDeletionScopes(tx)
      if (scopes.some(scope => libraryDeletionOverlaps(args, scope))) return 'conflict' as const
    }
    const claimed = await tx.queue_failed_job.deleteMany({ where: { id: failed.id } })
    if (!claimed.count) return null
    if (existing) return toJobLike(existing)

    await setManualItemDeletionFlag(tx, failed, 1)
    const job = await tx.queue_job.create({
      data: queueJobData({
        taskQueue: failed.task_queue,
        taskName: failed.task_name,
        command: failed.command,
        args,
        priority: failed.command === 'deleteLibraryFile' ? TaskPriority.deleteFile : TaskPriority.deleteManga,
        timeout: failed.command === 'deleteLibraryFile' ? Math.max(config.timeout, 600000) : config.timeout,
      }),
    })
    return toJobLike(job)
  }, { isolationLevel: 'Serializable' })
}

export async function pathJobExists(taskName: string) {
  const count = await db.queue_job.count({
    where: {
      queue_name: getQueueName(),
      OR: [{ task_name: taskName }, { task_name: { startsWith: `${taskName}_` } }],
      status: { in: ['pending', 'running'] },
    },
  })

  return count > 0
}

export async function countActiveScanChildren(scanRunId: number) {
  return db.queue_job.count({
    where: {
      queue_name: getQueueName(),
      command: 'taskScanManga',
      task_name: { contains: `_run_${scanRunId}_` },
      status: { in: ['pending', 'running'] },
    },
  })
}

export async function claimNextJob(input: ClaimInput): Promise<QueueJobRecord | null> {
  const now = new Date()
  const lockedUntil = new Date(now.getTime() + input.stalledAfterMs)
  const candidates = await db.queue_job.findMany({
    where: {
      queue_name: getQueueName(),
      task_queue: { in: input.taskQueues },
      status: 'pending',
      available_at: { lte: now },
    },
    orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    take: 10,
  })

  for (const candidate of candidates) {
    const result = await db.queue_job.updateMany({
      where: {
        id: candidate.id,
        status: 'pending',
      },
      data: {
        status: 'running',
        locked_by: input.workerId,
        locked_until: lockedUntil,
        started_at: now,
        attempts_made: { increment: 1 },
        updated_at: now,
      },
    })

    if (result.count === 1) {
      return db.queue_job.findUnique({ where: { id: candidate.id } })
    }
  }

  return null
}

function runningAttempt(job: QueueJobRecord) {
  return {
    id: job.id,
    status: 'running',
    locked_by: job.locked_by,
    attempts_made: job.attempts_made,
  }
}

export async function markJobCompleted(job: QueueJobRecord) {
  const result = await db.queue_job.deleteMany({ where: runningAttempt(job) })
  return result.count > 0
}

export async function extendRunningJobLock(input: {
  jobId: number
  workerId: string
  attemptsMade: number
  lockedUntil: Date
}) {
  const result = await db.queue_job.updateMany({
    where: {
      id: input.jobId,
      status: 'running',
      locked_by: input.workerId,
      attempts_made: input.attemptsMade,
    },
    data: {
      locked_until: input.lockedUntil,
      updated_at: new Date(),
    },
  })
  return result.count === 1
}

function retryDelay(attemptsMade: number) {
  const config = getQueueConfig()
  const exponent = Math.max(attemptsMade - 1, 0)
  const baseDelay = config.retry.baseDelayMs * Math.pow(2, exponent)
  const cappedDelay = Math.min(baseDelay, config.retry.maxDelayMs)
  if (!config.retry.jitter) return cappedDelay
  return Math.round(cappedDelay * (0.5 + Math.random() * 0.5))
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.stack || error.message
  return String(error)
}

export async function markJobFailedOrRetry(
  job: QueueJobRecord,
  error: unknown,
  stalledBefore?: Date
): Promise<'retry' | 'failed' | 'stale'> {
  const now = new Date()
  const message = errorMessage(error)

  if (job.attempts_made < job.max_attempts) {
    const result = await db.queue_job.updateMany({
      where: runningAttempt(job),
      data: {
        status: 'pending',
        available_at: new Date(now.getTime() + retryDelay(job.attempts_made)),
        locked_by: null,
        locked_until: null,
        last_error: message,
        updated_at: now,
      },
    })
    return result.count ? 'retry' : 'stale'
  }

  return db.$transaction(async (tx: any) => {
    const where = { ...runningAttempt(job), ...(stalledBefore && { locked_until: { lt: stalledBefore } }) }
    const removed = await tx.queue_job.deleteMany({ where })
    if (!removed.count) return 'stale'
    await tx.queue_failed_job.create({
      data: {
        original_job_id: job.id,
        queue_name: job.queue_name,
        task_queue: job.task_queue,
        task_name: job.task_name,
        command: job.command,
        args: job.args,
        attempts_made: job.attempts_made,
        max_attempts: job.max_attempts,
        error: message,
        failed_at: now,
      },
    })
    await setManualItemDeletionFlag(tx, job, 0)
    return 'failed'
  })
}

export async function recoverStalledJobs() {
  const now = new Date()
  const stalledJobs: QueueJobRecord[] = await db.queue_job.findMany({
    where: {
      queue_name: getQueueName(),
      status: 'running',
      locked_until: { lt: now },
    },
    take: 50,
  })

  for (const job of stalledJobs) {
    if (job.attempts_made >= job.max_attempts) {
      const error = new Error(job.last_error || 'Job stalled')
      const outcome = await markJobFailedOrRetry(job, error, now)
      if (outcome === 'failed') {
        const { handleScanQueueTerminalFailure } = await import('../scan/scan_report_service.js')
        await handleScanQueueTerminalFailure(job.command, decodeJson(job.args), error)
        // p2p 子任务僵死且耗尽重试后,同步将对应 p2p_transfer_task 置失败,
        // 否则父 p2p_transfer 会因子任务残留 running 而永远无法收敛
        if (/^taskP2P/.test(job.command)) {
          const { handleP2PQueueJobFailure } = await import(
            '../p2p/pull/pull_child_tracker.js'
          )
          await handleP2PQueueJobFailure(decodeJson(job.args), error)
        }
      }
    } else {
      await db.queue_job.updateMany({
        where: { ...runningAttempt(job), locked_until: { lt: now } },
        data: {
          status: 'pending',
          available_at: now,
          locked_by: null,
          locked_until: null,
          updated_at: now,
        },
      })
    }
  }
}

export async function heartbeatWorker(input: {
  workerId: string
  workerGroup: string
  mode: string
  queues: string[]
}) {
  const now = new Date()
  await db.queue_worker.upsert({
    where: { worker_id: input.workerId },
    update: {
      status: 'running',
      heartbeat_at: now,
      stopped_at: null,
      queues: encodeJson(input.queues),
      metadata: encodeJson({
        pid: process.pid,
        hostname: process.env.HOSTNAME || null,
      }),
    },
    create: {
      worker_id: input.workerId,
      worker_group: input.workerGroup,
      mode: input.mode,
      queues: encodeJson(input.queues),
      status: 'running',
      started_at: now,
      heartbeat_at: now,
      metadata: encodeJson({
        pid: process.pid,
        hostname: process.env.HOSTNAME || null,
      }),
    },
  })
}

export async function stopWorker(workerId: string) {
  await db.queue_worker.updateMany({
    where: { worker_id: workerId },
    data: {
      status: 'stopped',
      stopped_at: new Date(),
    },
  })
}
