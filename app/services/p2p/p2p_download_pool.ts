/**
 * P2P 多源并行下载池
 *
 * 设计目标:
 *  - 把所有待下载的文件扁平化为 FileTask 队列
 *  - 每个 seed(对端节点)对应一个 Worker,N 个 seed 同时跑 → 真并行
 *  - Worker 循环从共享队列取任务下载,谁先空闲谁取下一个 → 自动负载均衡
 *  - 任务失败 → 重新入队由其他 Worker 取走,失败计数累计
 *  - 单 seed 连续失败超阈值 → 暂时禁用该 seed
 *  - 任务级最大重试次数超限 → 整个传输任务标记失败
 *
 * 不在本类中处理:
 *  - 取消(cancel)逻辑由调用方通过 isCanceled() 回调注入
 *  - 字节进度上报由调用方通过 onBytes 回调累计
 *  - 鉴权 headers 由调用方传入
 */

import axios from 'axios'
import fs from 'fs'
import path from 'path'

export type Seed = {
  nodeId: string
  nodeName: string | null
  baseUrl: string
}

export type FileTask = {
  /** 对端文件绝对路径(给 /p2p/serve/file 的 file 参数用) */
  remoteAbsPath: string
  /** 本地保存绝对路径 */
  localPath: string
  /** 期望文件大小(对端 stat 给出),用于完整性校验;0 表示未知不校验 */
  size: number
  /** 任务级失败次数 */
  attempts: number
  /** 最近一次错误描述,用于汇总日志 */
  lastError?: string
}

export type DownloadPoolOptions = {
  /** 每个文件最多重试次数(跨 seed),默认 5 */
  maxAttemptsPerTask?: number
  /** 单 seed 连续失败阈值,超过则暂时禁用,默认 3 */
  maxFailurePerSeed?: number
  /** 单文件请求超时(ms),默认 60s */
  fileTimeoutMs?: number
  /** 鉴权头(X-Node-Id / X-Group-No / X-Timestamp) */
  headers: Record<string, string>
  /** 字节进度回调:每写入一段数据触发(用于实时速率/进度) */
  onBytes?: (delta: number) => void
  /** 任务完成回调(单文件完成,无论是否新下载) */
  onFileDone?: (task: FileTask) => void
  /** 取消检测:返回 true 立即停止所有 worker */
  isCanceled?: () => Promise<boolean> | boolean
  /** 日志前缀 */
  logTag?: string
}

type InternalState = {
  queue: FileTask[]
  /** seed 失败计数,达到阈值的 seed 暂时不再分配任务 */
  seedFailures: Map<string, number>
  /** 已完全失败的任务(超过 maxAttemptsPerTask) */
  fatalErrors: Array<{ task: FileTask; error: string }>
  /** 累计下载字节数(仅成功部分) */
  totalDownloadedBytes: number
  /** 是否已被取消 */
  canceled: boolean
}

export class P2PDownloadPool {
  private opts: Required<Pick<DownloadPoolOptions,
    'maxAttemptsPerTask' | 'maxFailurePerSeed' | 'fileTimeoutMs'>> & DownloadPoolOptions

  private state: InternalState = {
    queue: [],
    seedFailures: new Map(),
    fatalErrors: [],
    totalDownloadedBytes: 0,
    canceled: false,
  }

  constructor(opts: DownloadPoolOptions) {
    this.opts = {
      maxAttemptsPerTask: 5,
      maxFailurePerSeed: 3,
      fileTimeoutMs: 60 * 1000,
      ...opts,
    }
  }

  /** 入队一批待下载文件;localPath 父目录不存在会自动创建 */
  enqueue(tasks: FileTask[]) {
    for (const t of tasks) {
      this.state.queue.push({ ...t, attempts: t.attempts ?? 0 })
    }
  }

  /** 当前队列长度(待处理) */
  pendingCount() {
    return this.state.queue.length
  }

  /** 累计已成功下载字节数 */
  downloadedBytes() {
    return this.state.totalDownloadedBytes
  }

  /** 已最终失败的任务(便于上层汇总错误) */
  fatalErrors() {
    return this.state.fatalErrors
  }

  /**
   * 启动 N 个 worker(每个 seed 一个)并发处理队列,等到队列清空或失败终止。
   * - 抛出异常:存在不可重试的致命错误,或所有 seed 全部失效但队列还有任务
   */
  async run(seeds: Seed[]) {
    if (!seeds.length) throw new Error('seeds 列表为空,无法启动下载池')
    const tag = this.opts.logTag || 'p2p-pool'

    console.log(`[${tag}] 启动 ${seeds.length} 个 worker, 待下载文件=${this.state.queue.length}`)

    const workers = seeds.map((seed) => this.runWorker(seed))
    await Promise.all(workers)

    if (this.state.canceled) {
      throw new Error('下载已被取消')
    }

    if (this.state.queue.length > 0) {
      // 还有任务但所有 worker 都退出了 → 所有 seed 都被禁用
      throw new Error(
        `所有 seed 均不可用,剩余 ${this.state.queue.length} 个文件未下载;` +
        `seedFailures=${JSON.stringify(Object.fromEntries(this.state.seedFailures))}`
      )
    }

    if (this.state.fatalErrors.length > 0) {
      const sample = this.state.fatalErrors.slice(0, 3)
        .map((e) => `${path.basename(e.task.remoteAbsPath)}: ${e.error}`)
        .join('; ')
      throw new Error(
        `存在 ${this.state.fatalErrors.length} 个文件超过最大重试次数,例如 ${sample}`
      )
    }

    console.log(`[${tag}] 全部完成, 累计下载字节=${this.state.totalDownloadedBytes}`)
  }

  /** 单个 worker 的主循环:不断从队列取任务,直到队列空或自身被禁用或被取消 */
  private async runWorker(seed: Seed) {
    const tag = this.opts.logTag || 'p2p-pool'

    while (true) {
      // 取消检查
      if (this.state.canceled) return
      if (this.opts.isCanceled) {
        try {
          if (await this.opts.isCanceled()) {
            this.state.canceled = true
            return
          }
        } catch {
          // 忽略 isCanceled 自身错误
        }
      }

      // 自身已被禁用
      const myFails = this.state.seedFailures.get(seed.nodeId) ?? 0
      if (myFails >= this.opts.maxFailurePerSeed) {
        console.warn(`[${tag}] worker ${seed.nodeName || seed.nodeId} 失败次数=${myFails} 已禁用,退出`)
        return
      }

      // 取一个任务
      const task = this.state.queue.shift()
      if (!task) return

      try {
        const downloadedBytes = await this.downloadOne(seed, task)
        if (downloadedBytes > 0) {
          this.state.totalDownloadedBytes += downloadedBytes
        }
        // 成功,触发回调
        if (this.opts.onFileDone) {
          try { this.opts.onFileDone(task) } catch {}
        }
      } catch (err: any) {
        // 单文件下载失败:计 seed 失败 + 任务失败
        const cur = this.state.seedFailures.get(seed.nodeId) ?? 0
        this.state.seedFailures.set(seed.nodeId, cur + 1)

        task.attempts += 1
        task.lastError = err?.message || String(err)
        console.warn(
          `[${tag}] 下载失败 file=${path.basename(task.remoteAbsPath)} ` +
          `seed=${seed.nodeName || seed.nodeId} attempts=${task.attempts}/${this.opts.maxAttemptsPerTask} ` +
          `err=${task.lastError}`
        )

        if (task.attempts >= this.opts.maxAttemptsPerTask) {
          // 任务级最终失败
          this.state.fatalErrors.push({ task, error: task.lastError || 'unknown' })
        } else {
          // 回队列,下次由别的 worker 取(注意不能保证一定不再回到自己,但 round-robin 自然会分散)
          this.state.queue.push(task)
        }
      }
    }
  }

  /**
   * 下载单个文件:
   *  1. 若本地已存在且 size 一致(或 task.size==0 且本地非空)→ 跳过
   *  2. 流式 POST /p2p/serve/file 写入临时文件
   *  3. 写完比对 size,不一致删除并抛错(由上层重试)
   *  4. 成功 → rename 到目标路径
   * @returns 实际新下载的字节数(已存在跳过返回 0)
   */
  private async downloadOne(seed: Seed, task: FileTask): Promise<number> {
    // 确保父目录存在
    const dir = path.dirname(task.localPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // 已存在文件:size 校验通过则跳过
    if (fs.existsSync(task.localPath)) {
      const st = fs.statSync(task.localPath)
      if (task.size > 0) {
        if (st.size === task.size) {
          return 0
        }
        // 大小不一致,删除重下
        try { fs.unlinkSync(task.localPath) } catch {}
      } else if (st.size > 0) {
        // 期望大小未知 + 本地非空,保守起见认为已下载
        return 0
      } else {
        // 本地空文件,删除重下
        try { fs.unlinkSync(task.localPath) } catch {}
      }
    }

    const tmpPath = task.localPath + '.p2p-tmp'
    // 清理可能残留的临时文件
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath) } catch {}
    }

    let writtenBytes = 0
    const writer = fs.createWriteStream(tmpPath)

    let res: any
    try {
      res = await axios({
        method: 'post',
        url: `${seed.baseUrl}/p2p/serve/file`,
        headers: { ...this.opts.headers, 'Content-Type': 'application/json; charset=UTF-8' },
        data: { file: task.remoteAbsPath },
        responseType: 'stream',
        timeout: this.opts.fileTimeoutMs,
        // 禁用 axios 默认的 maxContentLength 限制(stream 不受影响,但保险)
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })
    } catch (e) {
      // 连接/响应阶段失败,关闭 writer 并清理临时文件
      try { writer.destroy() } catch {}
      try { fs.unlinkSync(tmpPath) } catch {}
      throw e
    }

    // 数据流处理 + 字节进度上报
    res.data.on('data', (chunk: Buffer) => {
      writtenBytes += chunk.length
      if (this.opts.onBytes) {
        try { this.opts.onBytes(chunk.length) } catch {}
      }
    })

    res.data.pipe(writer)

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', () => resolve())
      writer.on('error', (err: any) => {
        try { res.data.destroy() } catch {}
        try { fs.unlinkSync(tmpPath) } catch {}
        reject(new Error(`文件写入失败: ${err.message}`))
      })
      res.data.on('error', (err: any) => {
        try { writer.destroy() } catch {}
        try { fs.unlinkSync(tmpPath) } catch {}
        reject(err)
      })
    })

    // size 完整性校验
    if (task.size > 0 && writtenBytes !== task.size) {
      try { fs.unlinkSync(tmpPath) } catch {}
      throw new Error(
        `size 不一致: 期望=${task.size} 实际=${writtenBytes} (file=${task.remoteAbsPath})`
      )
    }

    // 原子化提交
    try {
      fs.renameSync(tmpPath, task.localPath)
    } catch (e: any) {
      // Windows 下若目标已存在(并发场景),先删再 rename
      try {
        if (fs.existsSync(task.localPath)) fs.unlinkSync(task.localPath)
        fs.renameSync(tmpPath, task.localPath)
      } catch (e2: any) {
        try { fs.unlinkSync(tmpPath) } catch {}
        throw new Error(`rename 失败: ${e2.message}`)
      }
    }

    return writtenBytes
  }
}