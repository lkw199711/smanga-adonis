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
      // p2p 队列的归属是动态的(见 getEffectiveWorkerQueues):
      // 独立 p2p worker 关闭时由 background 兜底消费,启用时让给 p2p worker。
      // 故此静态列表不写 'p2p',避免与独立 p2p worker 形成双消费者抢任务。
      queues: ['scan', 'sync', 'default'],
      concurrency: 1,
    },
    p2p: {
      // 独立 p2p worker 默认关闭;关闭时 p2p 队列由 background 动态接管(见 getEffectiveWorkerQueues)
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

/**
 * 计算某个 worker 实际消费的队列列表(动态归属 p2p 队列)。
 *
 * 设计约定:p2p 队列必须且只能有一个消费者,否则多个 worker 会竞争认领同一批任务,
 * 破坏独立 p2p worker 的并发隔离。归属规则:
 *  - 独立 p2p worker 启用(workers.p2p.enabled=true)时,p2p 由它消费,background 让出;
 *  - 独立 p2p worker 关闭(默认)时,p2p 回落给 background 兜底消费,避免无人消费导致任务永久卡住。
 *
 * 这样无论静态配置的 background.queues 是否写了 'p2p',运行时都能保证 p2p 恰好一个消费者。
 */
export function getEffectiveWorkerQueues(workerGroup: QueueWorkerGroup): string[] {
  const cfg = getQueueConfig()
  const queues = [...(cfg.workers[workerGroup]?.queues || [])]
  const p2pWorkerEnabled = cfg.workers.p2p?.enabled === true

  if (workerGroup === 'background') {
    if (p2pWorkerEnabled) {
      // 独立 p2p worker 接管 p2p,background 不再消费以免抢任务
      return queues.filter((q) => q !== 'p2p')
    }
    // 独立 p2p worker 未启用,background 兜底消费 p2p(插在 default 之前)
    if (!queues.includes('p2p')) {
      const idx = queues.indexOf('default')
      if (idx >= 0) queues.splice(idx, 0, 'p2p')
      else queues.push('p2p')
    }
    return queues
  }

  return queues
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
