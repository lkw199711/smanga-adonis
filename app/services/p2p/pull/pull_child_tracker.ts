import prisma from '#start/prisma'
import { get_config } from '#utils/index'
import { finalizePulledTransferToLocalShare } from './pull_local_share_finalize.js'

type ChildOutcome = {
  ok: boolean
  downloadedBytes: number
  error?: string
  canceled?: boolean
}

type TransferTaskRow = {
  id: number
  transfer_id: number
  parent_key: string | null
  task_key: string
  task_type: string
  queue_job_id: number | null
  status: string
  error_message: string | null
  started_at: Date | null
  finished_at: Date | null
}

const db = prisma as any

function sqlClient() {
  return String(get_config()?.sql?.client || 'sqlite').toLowerCase()
}

function toTerminalStatus(outcome: ChildOutcome): 'completed' | 'failed' | 'canceled' {
  if (outcome.canceled) return 'canceled'
  return outcome.ok ? 'completed' : 'failed'
}

async function queryTasks(transferId: number): Promise<TransferTaskRow[]> {
  const rows = await db.$queryRaw`
    SELECT id, transfer_id, parent_key, task_key, task_type, queue_job_id, status,
           error_message, started_at, finished_at
    FROM p2p_transfer_task
    WHERE transfer_id = ${transferId}
    ORDER BY id ASC
  `
  return rows as TransferTaskRow[]
}

async function findTask(transferId: number, taskKey: string): Promise<TransferTaskRow | null> {
  const rows = await db.$queryRaw`
    SELECT id, transfer_id, parent_key, task_key, task_type, queue_job_id, status,
           error_message, started_at, finished_at
    FROM p2p_transfer_task
    WHERE transfer_id = ${transferId} AND task_key = ${taskKey}
    LIMIT 1
  `
  return (rows as TransferTaskRow[])[0] ?? null
}

async function insertTask(input: {
  transferId: number
  parentKey?: string | null
  taskKey: string
  taskType: string
}) {
  const now = new Date()
  await db.$executeRaw`
    INSERT INTO p2p_transfer_task
      (transfer_id, parent_key, task_key, task_type, status, created_at, updated_at)
    VALUES
      (${input.transferId}, ${input.parentKey ?? null}, ${input.taskKey}, ${input.taskType}, 'pending', ${now}, ${now})
  `
}

async function updateTaskRow(
  transferId: number,
  taskKey: string,
  data: {
    status?: string
    errorMessage?: string | null
    queueJobId?: number | null
    startedAt?: Date | null
    finishedAt?: Date | null
  }
) {
  const task = await findTask(transferId, taskKey)
  if (!task) return

  const sets: string[] = ['updated_at = ?']
  const values: any[] = [new Date()]

  if (data.status !== undefined) {
    sets.push('status = ?')
    values.push(data.status)
  }
  if (data.errorMessage !== undefined) {
    sets.push('error_message = ?')
    values.push(data.errorMessage)
  }
  if (data.queueJobId !== undefined) {
    sets.push('queue_job_id = ?')
    values.push(data.queueJobId)
  }
  if (data.startedAt !== undefined) {
    sets.push('started_at = ?')
    values.push(data.startedAt)
  }
  if (data.finishedAt !== undefined) {
    sets.push('finished_at = ?')
    values.push(data.finishedAt)
  }

  values.push(task.id)

  if (sqlClient() === 'mysql') {
    await db.$executeRawUnsafe(
      `UPDATE p2p_transfer_task SET ${sets.join(', ')} WHERE id = ?`,
      ...values
    )
    return
  }

  let paramIndex = 0
  const sql = `UPDATE p2p_transfer_task SET ${sets
    .map((set) => set.replace(/\?/g, () => `$${++paramIndex}`))
    .join(', ')} WHERE id = $${++paramIndex}`
  await db.$executeRawUnsafe(sql, ...values)
}

export function initTracker(transferId: number, expectedTotal: number, totalBytes: number = 0): void {
  console.log(
    `[pull-tracker] init transferId=${transferId} expected=${expectedTotal} totalBytes=${totalBytes}`
  )
}

export async function registerTransferTask(input: {
  transferId: number
  taskKey: string
  taskType: string
  parentKey?: string | null
}) {
  const existing = await findTask(input.transferId, input.taskKey)
  if (existing) return existing
  await insertTask(input)
  return findTask(input.transferId, input.taskKey)
}

export async function attachQueueJobToTask(
  transferId: number,
  taskKey: string,
  queueJobId: number | null
) {
  await updateTaskRow(transferId, taskKey, { queueJobId })
}

export async function markTransferTaskRunning(transferId: number, taskKey: string) {
  await updateTaskRow(transferId, taskKey, {
    status: 'running',
    startedAt: new Date(),
    finishedAt: null,
    errorMessage: null,
  })
}

export async function markTransferTaskFailed(
  transferId: number,
  taskKey: string,
  errorMessage: string
) {
  await updateTaskRow(transferId, taskKey, {
    status: 'failed',
    errorMessage,
    finishedAt: new Date(),
  })
  await finalizeTransferIfReady(transferId)
}

export async function markTransferFailedDirectly(transferId: number, errorMessage: string) {
  await prisma.p2p_transfer
    .update({
      where: { p2pTransferId: transferId },
      data: {
        status: 'failed',
        error: errorMessage,
        endTime: new Date(),
        speedBps: 0,
      },
    })
    .catch(() => {})
}

export async function transferSelfToChildren(
  transferId: number,
  childCount: number
): Promise<void> {
  console.log(`[pull-tracker] transferId=${transferId} expanded into ${childCount} children`)
}

export async function notifyDone(
  transferId: number,
  outcome: ChildOutcome,
  taskKey?: string
): Promise<void> {
  if (!taskKey) {
    await finalizeTransferIfReady(transferId)
    return
  }

  await updateTaskRow(transferId, taskKey, {
    status: toTerminalStatus(outcome),
    errorMessage: outcome.ok ? null : outcome.error || null,
    finishedAt: new Date(),
  })

  await finalizeTransferIfReady(transferId)
}

export function dropTracker(transferId: number): void {
  console.log(`[pull-tracker] drop transferId=${transferId}`)
}

export async function peekTracker(transferId: number) {
  return queryTasks(transferId)
}

export async function finalizeTransferIfReady(transferId: number) {
  const tasks = await queryTasks(transferId)
  if (!tasks.length) return false
  if (tasks.some((task) => task.status === 'pending' || task.status === 'running')) {
    return false
  }

  const cur = await prisma.p2p_transfer.findUnique({
    where: { p2pTransferId: transferId },
    select: { status: true },
  })
  if (!cur) return false

  let finalStatus: 'success' | 'failed' | 'canceled' = 'success'
  let errorMsg: string | null = null

  if (cur.status === 'canceled') {
    finalStatus = 'canceled'
  } else if (tasks.some((task) => task.status === 'failed')) {
    finalStatus = 'failed'
    const sample = tasks
      .filter((task) => task.status === 'failed')
      .map((task) => task.error_message)
      .filter((message): message is string => !!message)
      .slice(0, 3)
      .join(' | ')
    const failedCount = tasks.filter((task) => task.status === 'failed').length
    errorMsg = `${failedCount}/${tasks.length} child tasks failed${sample ? `: ${sample}` : ''}`
  } else if (tasks.every((task) => task.status === 'canceled')) {
    finalStatus = 'canceled'
  }

  await prisma.p2p_transfer.update({
    where: { p2pTransferId: transferId },
    data: {
      status: finalStatus,
      progress: finalStatus === 'success' ? 100 : undefined,
      error: errorMsg,
      endTime: new Date(),
      speedBps: 0,
    },
  })

  if (finalStatus === 'success') {
    await finalizePulledTransferToLocalShare(transferId).catch((error) => {
      console.warn(`[pull-tracker] finalize local share failed transferId=${transferId}`, error)
    })
  }

  console.log(`[pull-tracker] finalize transferId=${transferId} => ${finalStatus}`)
  return true
}

export async function handleP2PQueueJobFailure(args: any, error: unknown) {
  const transferId = Number(args?.transferId)
  if (!Number.isFinite(transferId) || transferId <= 0) return

  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error)

  if (args?.taskKey) {
    await markTransferTaskFailed(transferId, String(args.taskKey), message)
    return
  }

  await markTransferFailedDirectly(transferId, message)
}

/**
 * 孤儿传输对账:修复"永远卡在进行中"的父任务。
 *
 * 触发场景:进程重启 / 队列被清理 / 子 job 因异常路径被删除,导致
 * p2p_transfer_task 停留在 pending|running,而其对应的 queue_jobs 行已不存在。
 * 此时 finalizeTransferIfReady 因存在未终态子任务而永远返回 false,
 * 父 p2p_transfer 永远停留在 running。
 *
 * 处理策略:遍历仍处于 pending|running 的 p2p_transfer,对其
 * 已分配 queue_job_id 但队列中已无对应 job 的未终态子任务,标记为 failed,
 * 随后收敛父任务终态。
 */
export async function reconcileOrphanTransfers(): Promise<void> {
  const transfers = await prisma.p2p_transfer.findMany({
    where: { status: { in: ['pending', 'running'] } },
    select: { p2pTransferId: true },
  })
  if (!transfers.length) return

  for (const t of transfers) {
    const transferId = t.p2pTransferId
    let orphanFound = false

    const tasks = await queryTasks(transferId)
    for (const task of tasks) {
      if (task.status !== 'pending' && task.status !== 'running') continue
      // 尚未分配队列 job(addTask 与 attach 之间的瞬态)→ 跳过,避免误杀
      if (!task.queue_job_id) continue

      const job = await db.queue_job.findUnique({ where: { id: task.queue_job_id } })
      if (job) continue // 队列中仍有对应 job(pending/running),交由正常流程处理

      orphanFound = true
      await updateTaskRow(transferId, task.task_key, {
        status: 'failed',
        errorMessage: 'queue job lost (worker restart or queue cleared)',
        finishedAt: new Date(),
      })
    }

    if (orphanFound) {
      console.warn(`[pull-tracker] reconcile orphan transferId=${transferId}, marking lost tasks failed`)
      await finalizeTransferIfReady(transferId)
    }
  }
}
