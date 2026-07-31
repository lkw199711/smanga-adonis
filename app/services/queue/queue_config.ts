import { get_config } from '#utils/index'

export type QueueWorkerMode = 'embedded' | 'external' | 'disabled'
export type QueueWorkerGroup = 'background' | 'p2p' | 'compress'

export type QueueWorkerConfig = {
  enabled: boolean
  queues: string[]
  concurrency: number
}

export type QueueConfig = {
  driver: 'sql'
  attempts: number
  timeout: number
  pollIntervalMs: number
  retry: {
    baseDelayMs: number
    maxDelayMs: number
    jitter: boolean
  }
  worker: {
    mode: QueueWorkerMode
    stalledAfterMs: number
    heartbeatIntervalMs: number
    gracefulShutdownMs: number
  }
  workers: Record<QueueWorkerGroup, QueueWorkerConfig>
}

const defaultQueueConfig: QueueConfig = {
  driver: 'sql',
  attempts: 3,
  timeout: 120000,
  pollIntervalMs: 1000,
  retry: {
    baseDelayMs: 10000,
    maxDelayMs: 120000,
    jitter: true,
  },
  worker: {
    mode: 'external',
    stalledAfterMs: 60000,
    heartbeatIntervalMs: 10000,
    gracefulShutdownMs: 30000,
  },
  workers: {
    background: {
      enabled: true,
      // 设计约定:不启用独立 p2p 进程,p2p 任务由 background worker 统一消费,
      // 因此 background.queues 必须包含 'p2p'(见 docker init-config 生成的默认配置)
      queues: ['scan', 'sync', 'p2p', 'default'],
      concurrency: 1,
    },
    p2p: {
      // 独立 p2p worker 默认关闭:svc-queue-p2p 未纳入 s6 user bundle,
      // 启用也不会有进程消费;p2p 一律走 background 队列
      enabled: false,
      queues: ['p2p'],
      concurrency: 3,
    },
    compress: {
      enabled: true,
      queues: ['compress'],
      concurrency: 1,
    },
  },
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getRawQueueConfig() {
  return get_config()?.queue || {}
}

export function getQueueConfig(): QueueConfig {
  const raw = getRawQueueConfig()

  return {
    driver: 'sql',
    attempts: positiveNumber(raw.attempts, defaultQueueConfig.attempts),
    timeout: positiveNumber(raw.timeout, defaultQueueConfig.timeout),
    pollIntervalMs: positiveNumber(raw.pollIntervalMs, defaultQueueConfig.pollIntervalMs),
    retry: {
      baseDelayMs: positiveNumber(raw.retry?.baseDelayMs, defaultQueueConfig.retry.baseDelayMs),
      maxDelayMs: positiveNumber(raw.retry?.maxDelayMs, defaultQueueConfig.retry.maxDelayMs),
      jitter: raw.retry?.jitter ?? defaultQueueConfig.retry.jitter,
    },
    worker: {
      mode: ['embedded', 'external', 'disabled'].includes(raw.worker?.mode)
        ? raw.worker.mode
        : defaultQueueConfig.worker.mode,
      stalledAfterMs: positiveNumber(
        raw.worker?.stalledAfterMs,
        defaultQueueConfig.worker.stalledAfterMs
      ),
      heartbeatIntervalMs: positiveNumber(
        raw.worker?.heartbeatIntervalMs,
        defaultQueueConfig.worker.heartbeatIntervalMs
      ),
      gracefulShutdownMs: positiveNumber(
        raw.worker?.gracefulShutdownMs,
        defaultQueueConfig.worker.gracefulShutdownMs
      ),
    },
    workers: {
      background: {
        enabled: raw.workers?.background?.enabled ?? defaultQueueConfig.workers.background.enabled,
        queues: raw.workers?.background?.queues || defaultQueueConfig.workers.background.queues,
        concurrency: positiveNumber(raw.workers?.background?.concurrency, defaultQueueConfig.workers.background.concurrency),
      },
      p2p: {
        enabled: raw.workers?.p2p?.enabled ?? defaultQueueConfig.workers.p2p.enabled,
        queues: raw.workers?.p2p?.queues || defaultQueueConfig.workers.p2p.queues,
        concurrency: positiveNumber(raw.workers?.p2p?.concurrency, defaultQueueConfig.workers.p2p.concurrency),
      },
      compress: {
        enabled: raw.workers?.compress?.enabled ?? defaultQueueConfig.workers.compress.enabled,
        queues: raw.workers?.compress?.queues || defaultQueueConfig.workers.compress.queues,
        concurrency: positiveNumber(raw.workers?.compress?.concurrency, defaultQueueConfig.workers.compress.concurrency),
      },
    },
  }
}

export function getQueueName() {
  const serverKey = (get_config()?.serverKey || 'default').toString().trim() || 'default'
  return `smanga:${serverKey}`
}

export function getWorkerConfig(workerGroup: QueueWorkerGroup) {
  return getQueueConfig().workers[workerGroup]
}

export function resolveTaskQueue(taskName: string, command: string) {
  if (/compress/i.test(taskName) || ['compressChapter', 'clearCompressCache'].includes(command)) {
    return 'compress'
  }

  if (/sync/i.test(taskName) || /^taskSync/.test(command)) {
    return 'sync'
  }

  if (/p2p/i.test(taskName) || /^taskP2P/.test(command)) {
    return 'p2p'
  }

  if (/scan/i.test(taskName) || /^taskScan/.test(command) || /^delete/.test(command)) {
    return 'scan'
  }

  return 'default'
}

export function getDefaultQueueConfig() {
  return defaultQueueConfig
}
