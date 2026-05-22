import { get_config } from '#utils/index'
import { getQueueConfig, resolveTaskQueue } from './queue/queue_config.js'
import {
  cleanJobs,
  enqueueJob,
  getJob,
  listJobs,
  pathJobExists,
} from './queue/sql_queue_repository.js'

type AddTaskType = {
  taskName: string
  command: string
  args: any
  priority?: number
  timeout?: number
}

const scanQueue = {
  getJobs: async (states?: string[]) => listJobs(states),
  getJob: async (id: string | number) => getJob(id),
  clean: async (_grace?: number, _status?: string, _limit?: number, states?: string[]) => {
    await cleanJobs(states)
  },
}

const deleteQueue = scanQueue
const compressQueue = scanQueue

async function path_scanning(pathId: number) {
  return pathJobExists(`scan_path_${pathId}`)
}

async function path_deleting(pathId: number) {
  return pathJobExists(`delete_path_${pathId}`)
}

async function runTaskSync(command: string, args: any) {
  const { runJobCommand } = await import('./queue/job_runner.js')
  await runJobCommand(command, args)
}

async function addTask({ taskName, command, args, priority, timeout }: AddTaskType) {
  console.log(`添加任务: ${taskName}`)

  const config = get_config()
  const dispatchSync = config.debug?.dispatchSync === 1 || config.debug?.dispatchSync === '1'
  if (dispatchSync) {
    await runTaskSync(command, args)
    return {
      id: 'sync',
      data: { taskName, command, args },
      queue: { name: 'sync' },
      opts: { priority, timeout },
    }
  }

  if (command === 'taskScanPath') {
    if (await path_scanning(args.pathId)) {
      console.log(`路径${args.pathId} 正在被扫描,跳过执行`)
      return false
    }
  } else if (command === 'deletePath') {
    if (await path_deleting(args.pathId)) {
      console.log(`路径${args.pathId} 正在被删除,跳过执行`)
      return false
    }
  }

  const queueConfig = getQueueConfig()
  const taskQueue = resolveTaskQueue(taskName, command)
  return enqueueJob({
    taskQueue,
    taskName,
    command,
    args,
    priority,
    timeout: timeout ?? queueConfig.timeout,
  })
}

export { scanQueue, deleteQueue, compressQueue, addTask, path_scanning, path_deleting }
