import 'reflect-metadata'
import { get_config } from '#utils/index'
import {
  getQueueConfig,
  getWorkerConfig,
  type QueueWorkerGroup,
} from '#services/queue/queue_config'
import { SqlQueueWorkerService } from '#services/queue/sql_queue_worker_service'

function parseWorkerGroup(): QueueWorkerGroup {
  const arg = process.argv.find((item) => item.startsWith('--worker='))
  const worker = arg?.split('=')[1]
  if (worker === 'background' || worker === 'p2p' || worker === 'compress') return worker
  return 'background'
}

function sleepForever(reason: string) {
  console.log(`[queue] ${reason}; sleeping`)
  setInterval(() => undefined, 60 * 60 * 1000)
}

const appConfig = get_config()
if (!appConfig?.sql?.deploy) {
  sleepForever('deploy not completed, Prisma not initialized')
}

const workerGroup = parseWorkerGroup()
const config = getQueueConfig()
const workerConfig = getWorkerConfig(workerGroup)

if (config.worker.mode !== 'external') {
  sleepForever(`worker mode is ${config.worker.mode}, expected external`)
} else if (!workerConfig.enabled) {
  sleepForever(`worker ${workerGroup} disabled`)
} else {
  const worker = new SqlQueueWorkerService(workerGroup, 'external')
  const shutdown = async () => {
    await worker.stop()
    process.exit(0)
  }

  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)

  worker.start().catch((error) => {
    console.error('[queue] worker failed to start', error)
    process.exit(1)
  })
}
