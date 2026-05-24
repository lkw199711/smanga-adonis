/**
 * 队列子进程入口
 *
 * 由 sql_queue_worker_service 通过 child_process.fork() 启动。
 * 从环境变量读取 job 信息，执行后 exit(0) 或 exit(1)。
 * 子进程退出后 OS 回收所有内存（V8 堆 + sharp 原生内存 + Prisma 引擎内存）。
 */

const command = process.env.QUEUE_JOB_COMMAND
const argsJson = process.env.QUEUE_JOB_ARGS || '{}'

if (!command) {
  console.error('[queue child] missing QUEUE_JOB_COMMAND')
  process.exit(1)
}

let args: any
try {
  args = JSON.parse(argsJson)
} catch {
  console.error('[queue child] invalid QUEUE_JOB_ARGS:', argsJson)
  process.exit(1)
}

async function main() {
  const { runJobCommand } = await import('#services/queue/job_runner')
  try {
    await runJobCommand(command!, args)
    process.exit(0)
  } catch (error: any) {
    console.error('[queue child] job failed:', error?.message || error)
    process.exit(1)
  }
}

main()
