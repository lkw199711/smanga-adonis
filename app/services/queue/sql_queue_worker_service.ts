import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getQueueConfig, getWorkerConfig, type QueueWorkerGroup } from './queue_config.js'
import {
  claimNextJob,
  heartbeatWorker,
  markJobCompleted,
  markJobFailedOrRetry,
  recoverStalledJobs,
  stopWorker,
  decodeJson,
} from './sql_queue_repository.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
          await markJobFailedOrRetry(job, error)
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

      const child = fork(queueChildWorkerPath, [], {
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
        try {
          if (code === 0) {
            await markJobCompleted(job.id)
          } else {
            const reason = signal
              ? `killed by signal ${signal}`
              : stderr.trim() || `exit code ${code}`
            await markJobFailedOrRetry(job, new Error(reason))
          }
        } catch (err) {
          console.error(`[queue] failed to update job ${job.id} status`, err)
        } finally {
          resolve()
        }
      })

      child.on('error', async (err) => {
        clearTimeout(timeoutId)
        try {
          await markJobFailedOrRetry(job, err)
        } catch {}
        finally {
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

  for (const workerGroup of ['background', 'compress'] as QueueWorkerGroup[]) {
    const worker = new SqlQueueWorkerService(workerGroup, 'embedded')
    await worker.start()
    embeddedWorkers.push(worker)
  }
}

export async function stopEmbeddedQueueWorkers() {
  await Promise.all(embeddedWorkers.map((worker) => worker.stop()))
  embeddedWorkers.length = 0
}
