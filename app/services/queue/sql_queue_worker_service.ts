import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getQueueConfig, getWorkerConfig, type QueueWorkerGroup } from './queue_config.js'
import {
  claimNextJob,
  extendRunningJobLock,
  heartbeatWorker,
  markJobCompleted,
  markJobFailedOrRetry,
  recoverStalledJobs,
  stopWorker,
  decodeJson,
} from './sql_queue_repository.js'
import { handleP2PQueueJobFailure } from '../p2p/pull/pull_child_tracker.js'
import { handleScanQueueTerminalFailure } from '../scan/scan_report_service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatChildStderr(stderr: string) {
  const output = stderr.trim()
  const maxLength = 64 * 1024
  if (output.length <= maxLength) return output

  const halfLength = Math.floor(maxLength / 2)
  return `${output.slice(0, halfLength)}\n... child stderr truncated ...\n${output.slice(-halfLength)}`
}

function buildChildFailureReason({
  job,
  pid,
  code,
  signal,
  stderr,
}: {
  job: any
  pid?: number
  code: number | null
  signal: NodeJS.Signals | null
  stderr: string
}) {
  const details = [
    'queue child process failed',
    `jobId=${job.id}`,
    `command=${job.command}`,
    `pid=${pid ?? 'unknown'}`,
    `exitCode=${code ?? 'null'}`,
    `signal=${signal ?? 'none'}`,
  ]
  const output = formatChildStderr(stderr)
  if (output) details.push(`stderr:\n${output}`)
  return details.join('\n')
}

/**
 * Queue children must retain the TypeScript loader in development, but must not
 * inherit hot-hook. The hook starts fsevents watchers in every short-lived
 * child; on macOS their native teardown can abort the Node process.
 */
function getQueueChildExecArgv(execArgv = process.execArgv) {
  return execArgv.filter((arg, index) => {
    const nextArg = execArgv[index + 1]
    if (arg.includes('hot-hook/register')) return false
    if (arg === '--import' && nextArg?.includes('hot-hook/register')) return false
    return true
  })
}

export class SqlQueueWorkerService {
  private stopping = false
  private running = 0
  private heartbeatTimer?: NodeJS.Timeout
  private recoverTimer?: NodeJS.Timeout
  private loops: Promise<void>[] = []
  readonly workerId: string

  constructor(
    private workerGroup: QueueWorkerGroup,
    private mode = getQueueConfig().worker.mode
  ) {
    this.workerId = `${os.hostname()}:${process.pid}:${workerGroup}:${randomUUID()}`
  }

  async start() {
    const config = getQueueConfig()
    const workerConfig = getWorkerConfig(this.workerGroup)

    if (!workerConfig.enabled) {
      console.log(`[queue] worker ${this.workerGroup} disabled`)
      return
    }

    console.log(
      `[queue] worker ${this.workerGroup} started, queues=${workerConfig.queues.join(',')}, concurrency=${workerConfig.concurrency}`
    )

    await recoverStalledJobs()
    await heartbeatWorker({
      workerId: this.workerId,
      workerGroup: this.workerGroup,
      mode: this.mode,
      queues: workerConfig.queues,
    })

    this.heartbeatTimer = setInterval(() => {
      heartbeatWorker({
        workerId: this.workerId,
        workerGroup: this.workerGroup,
        mode: this.mode,
        queues: workerConfig.queues,
      }).catch((error) => console.error('[queue] heartbeat failed', error))
    }, config.worker.heartbeatIntervalMs)

    this.recoverTimer = setInterval(() => {
      recoverStalledJobs().catch((error) => console.error('[queue] stalled recovery failed', error))
    }, config.worker.stalledAfterMs)

    for (let i = 0; i < workerConfig.concurrency; i++) {
      this.loops.push(this.workLoop())
    }
  }

  async stop() {
    this.stopping = true
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.recoverTimer) clearInterval(this.recoverTimer)

    const deadline = Date.now() + getQueueConfig().worker.gracefulShutdownMs
    while (this.running > 0 && Date.now() < deadline) {
      await sleep(250)
    }

    await stopWorker(this.workerId)
    console.log(`[queue] worker ${this.workerGroup} stopped`)
  }

  private async workLoop() {
    const config = getQueueConfig()
    const workerConfig = getWorkerConfig(this.workerGroup)

    while (!this.stopping) {
      try {
        const job = await claimNextJob({
          workerId: this.workerId,
          taskQueues: workerConfig.queues,
          stalledAfterMs: config.worker.stalledAfterMs,
        })

        if (!job) {
          await sleep(config.pollIntervalMs)
          continue
        }

        this.running += 1
        try {
          console.log(`[queue] job ${job.id} started: ${job.command}`)
          await this.runJobInChildProcess(job)
          console.log(`[queue] job ${job.id} completed: ${job.command}`)
        } catch (error) {
          console.error(`[queue] job ${job.id} failed: ${job.command}`, error)
          const outcome = await markJobFailedOrRetry(job, error)
          if (outcome === 'failed') {
            await handleScanQueueTerminalFailure(job.command, decodeJson(job.args), error)
          }
        } finally {
          this.running -= 1
        }
      } catch (error) {
        console.error(`[queue] worker ${this.workerGroup} loop failed`, error)
        await sleep(config.pollIntervalMs)
      }
    }
  }

  /**
   * 在子进程中执行 job
   * 子进程退出后 OS 自动回收所有内存
   */
  private runJobInChildProcess(job: any): Promise<void> {
    return new Promise((resolve) => {
      const args = decodeJson(job.args)
      const config = getQueueConfig()
      const queueChildWorkerPath = path.resolve(__dirname, '../../../bin/queue_child_worker.js')
      const childExecArgv = getQueueChildExecArgv()

      const child = fork(queueChildWorkerPath, [], {
        execArgv: childExecArgv,
        env: {
          ...process.env,
          QUEUE_JOB_COMMAND: job.command,
          QUEUE_JOB_ARGS: JSON.stringify(args),
        },
        silent: true,
      })

      let stderr = ''
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })
      child.stdout?.on('data', (data: Buffer) => {
        process.stdout.write(`[child-${job.id}] ${data}`)
      })

      const lockRenewIntervalMs = Math.max(5000, Math.floor(config.worker.stalledAfterMs / 3))
      const lockRenewTimer = setInterval(async () => {
        try {
          const lockedUntil = new Date(Date.now() + config.worker.stalledAfterMs)
          const ok = await extendRunningJobLock({
            jobId: job.id,
            workerId: this.workerId,
            lockedUntil,
          })
          if (!ok) {
            console.warn(`[queue] job ${job.id} lock renew lost, stopping child process`)
            child.kill('SIGTERM')
          }
        } catch (error) {
          console.error(`[queue] job ${job.id} lock renew failed`, error)
        }
      }, lockRenewIntervalMs)

      const timeoutMs = job.timeout_ms || config.timeout
      const timeoutId = setTimeout(() => {
        console.warn(`[queue] job ${job.id} timeout after ${timeoutMs}ms, killing child process`)
        child.kill('SIGTERM')
        // 5 秒后强制 SIGKILL
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL')
        }, 5000)
      }, timeoutMs)

      child.on('exit', async (code, signal) => {
        clearTimeout(timeoutId)
        clearInterval(lockRenewTimer)
        try {
          if (code === 0) {
            await markJobCompleted(job.id)
          } else {
            const reason = buildChildFailureReason({
              job,
              pid: child.pid,
              code,
              signal,
              stderr,
            })
            console.error(`[queue] ${reason}`)
            await handleP2PQueueJobFailure(args, new Error(reason))
            const error = new Error(reason)
            const outcome = await markJobFailedOrRetry(job, error)
            if (outcome === 'failed') {
              await handleScanQueueTerminalFailure(job.command, args, error)
            }
          }
        } catch (err) {
          console.error(`[queue] failed to update job ${job.id} status`, err)
        } finally {
          resolve()
        }
      })

      child.on('error', async (err) => {
        clearTimeout(timeoutId)
        clearInterval(lockRenewTimer)
        try {
          const reason = buildChildFailureReason({
            job,
            pid: child.pid,
            code: null,
            signal: null,
            stderr,
          })
          const error = new Error(`${reason}\nspawn error: ${err.message}`)
          console.error(`[queue] ${error.message}`)
          await handleP2PQueueJobFailure(args, error)
          const outcome = await markJobFailedOrRetry(job, error)
          if (outcome === 'failed') {
            await handleScanQueueTerminalFailure(job.command, args, error)
          }
        } catch {
        } finally {
          resolve()
        }
      })
    })
  }
}

const embeddedWorkers: SqlQueueWorkerService[] = []

export async function startEmbeddedQueueWorkers() {
  const config = getQueueConfig()
  if (config.worker.mode !== 'embedded') {
    console.log(`[queue] embedded workers skipped, mode=${config.worker.mode}`)
    return
  }

  if (embeddedWorkers.length > 0) return

  for (const workerGroup of ['background', 'p2p', 'compress'] as QueueWorkerGroup[]) {
    const wc = getWorkerConfig(workerGroup)
    if (!wc.enabled) {
      console.log(`[queue] worker ${workerGroup} disabled, skipping`)
      continue
    }
    const worker = new SqlQueueWorkerService(workerGroup, 'embedded')
    await worker.start()
    embeddedWorkers.push(worker)
  }
}

export async function stopEmbeddedQueueWorkers() {
  await Promise.all(embeddedWorkers.map((worker) => worker.stop()))
  embeddedWorkers.length = 0
}
