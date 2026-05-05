/**
 * P2P 多源并行下载池(支持大文件切片下载)
 *
 * 两层并行:
 *  - 跨文件并行:N 个 seed = N 个 Worker,Worker 从共享队列取任务
 *  - 大文件内并行:超过阈值的文件被切成多个分片,分片本身就是独立任务,被不同 Worker 取走
 *                   这样一个 zip 也能享受多节点带宽叠加
 *
 * 关键设计:
 *  - 普通任务和分片任务在同一队列里,Worker 不感知差异(下载逻辑唯一区别是带 Range 头)
 *  - 同一文件的所有分片共享一个 SliceContext,记录"还差几片",最后一片完成时由该 worker 触发合并
 *  - 分片失败回队列由其他 Worker 接走,只重下失败那一片(不影响其他分片)
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

/**
 * 分片下载上下文(同一文件的所有分片共享)
 */
type SliceContext = {
  /** 远端绝对路径 */
  remoteAbsPath: string
  /** 本地最终路径 */
  localPath: string
  /** 文件总大小 */
  totalSize: number
  /** 分片总数 */
  totalSlices: number
  /** 分片文件目录前缀(localPath.p2p-slice-<i>) */
  slicePathPrefix: string
  /** 已完成分片数(用于判断何时合并) */
  doneCount: number
  /** 是否已提交(合并 + rename),防重 */
  finalized: boolean
  /** 任一分片致命失败,整个文件标记失败,其余分片直接放弃 */
  aborted: boolean
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
  /**
   * 分片元信息:存在则表示这是一个分片任务,Worker 会用 Range 头下载 [start, end] 区间
   */
  slice?: {
    index: number
    start: number
    end: number
    ctx: SliceContext
  }
}

export type DownloadPoolOptions = {
  /** 每个文件最多重试次数(跨 seed),默认 5 */
  maxAttemptsPerTask?: number
  /** 单 seed 连续失败阈值,超过则进入冷静期(临时禁用),默认 3 */
  maxFailurePerSeed?: number
  /** seed 冷静期长度(ms),默认 30s。冷静期过后失败计数自动重置,seed 重新可用 */
  seedCooldownMs?: number
  /** 单文件请求超时(ms),默认 60s */
  fileTimeoutMs?: number
  /** 鉴权头(X-Node-Id / X-Group-No / X-Timestamp) */
  headers: Record<string, string>
  /** 字节进度回调:每写入一段数据触发(用于实时速率/进度) */
  onBytes?: (delta: number) => void
  /** 任务完成回调(单文件完成,无论是否新下载;分片任务不触发,合并完成后才触发) */
  onFileDone?: (task: FileTask) => void
  /** 取消检测:返回 true 立即停止所有 worker */
  isCanceled?: () => Promise<boolean> | boolean
  /** 日志前缀 */
  logTag?: string
  /**
   * 大文件切片阈值(字节),默认 8MB
   * 文件 size 超过该值且 seeds 数 ≥ 2 才会切片,否则按整文件下载
   */
  sliceThresholdBytes?: number
  /** 单分片大小(字节),默认 4MB */
  sliceSizeBytes?: number
  /** 单文件最多切多少片,防止小阈值大文件切出过多分片,默认 32 */
  maxSlicesPerFile?: number
}

type SeedRuntime = {
  /** 当前累计失败次数(冷静期内累计,过期归零) */
  failures: number
  /** 解禁时间戳(0 表示未禁用) */
  disabledUntil: number
}

type InternalState = {
  queue: FileTask[]
  /** seed 运行时状态(失败/冷静期) */
  seedRuntime: Map<string, SeedRuntime>
  /** 已完全失败的任务(超过 maxAttemptsPerTask) */
  fatalErrors: Array<{ task: FileTask; error: string }>
  /** 累计下载字节数(仅成功部分) */
  totalDownloadedBytes: number
  /** 是否已被取消 */
  canceled: boolean
}

export class P2PDownloadPool {
  private opts: Required<Pick<DownloadPoolOptions,
    'maxAttemptsPerTask' | 'maxFailurePerSeed' | 'seedCooldownMs' | 'fileTimeoutMs' |
    'sliceThresholdBytes' | 'sliceSizeBytes' | 'maxSlicesPerFile'>> & DownloadPoolOptions

  private state: InternalState = {
    queue: [],
    seedRuntime: new Map(),
    fatalErrors: [],
    totalDownloadedBytes: 0,
    canceled: false,
  }

  constructor(opts: DownloadPoolOptions) {
    this.opts = {
      maxAttemptsPerTask: 5,
      maxFailurePerSeed: 3,
      seedCooldownMs: 30 * 1000,
      fileTimeoutMs: 60 * 1000,
      sliceThresholdBytes: 8 * 1024 * 1024,
      sliceSizeBytes: 4 * 1024 * 1024,
      maxSlicesPerFile: 32,
      ...opts,
    }
  }

  /** 入队一批待下载文件 */
  enqueue(tasks: FileTask[]) {
    for (const t of tasks) {
      this.state.queue.push({ ...t, attempts: t.attempts ?? 0 })
    }
  }

  /** 当前队列长度(待处理) */
  pendingCount() {
    return this.state.queue.length
  }

  /** 累计已成功下载字节数(包含分片) */
  downloadedBytes() {
    return this.state.totalDownloadedBytes
  }

  /** 已最终失败的任务(便于上层汇总错误) */
  fatalErrors() {
    return this.state.fatalErrors
  }

  /**
   * 启动 N 个 worker(每个 seed 一个)并发处理队列
   * 启动前会先扫描整个队列,把大文件按阈值切成分片任务,再让 worker 消费
   */
  async run(seeds: Seed[]) {
    if (!seeds.length) throw new Error('seeds 列表为空,无法启动下载池')
    const tag = this.opts.logTag || 'p2p-pool'

    // 启动前对队列做切片预处理(seeds≥2 才切片,只有 1 个 seed 切片无意义)
    if (seeds.length >= 2) {
      this.state.queue = this.expandSlices(this.state.queue)
    }

    const sliceCount = this.state.queue.filter((t) => !!t.slice).length
    console.log(
      `[${tag}] 启动 ${seeds.length} 个 worker, 队列任务=${this.state.queue.length} ` +
      `(其中分片任务=${sliceCount}, 切片阈值=${this.opts.sliceThresholdBytes}B)`
    )

    const workers = seeds.map((seed) => this.runWorker(seed))
    await Promise.all(workers)

    if (this.state.canceled) {
      throw new Error('下载已被取消')
    }

    if (this.state.queue.length > 0) {
      throw new Error(
        `所有 seed 均不可用,剩余 ${this.state.queue.length} 个任务未处理;` +
        `seedRuntime=${JSON.stringify(this.dumpSeedRuntime())}`
      )
    }

    if (this.state.fatalErrors.length > 0) {
      const sample = this.state.fatalErrors.slice(0, 3)
        .map((e) => `${path.basename(e.task.remoteAbsPath)}: ${e.error}`)
        .join('; ')
      throw new Error(
        `存在 ${this.state.fatalErrors.length} 个任务超过最大重试次数,例如 ${sample}`
      )
    }

    console.log(`[${tag}] 全部完成, 累计下载字节=${this.state.totalDownloadedBytes}`)
  }

  /**
   * 把队列中的大文件展开为多个分片任务
   *  - size > sliceThresholdBytes 才切
   *  - 跳过已经在本地完整存在(size 一致)的文件,留给 Worker 自己跳过
   */
  private expandSlices(tasks: FileTask[]): FileTask[] {
    const result: FileTask[] = []
    const { sliceThresholdBytes, sliceSizeBytes, maxSlicesPerFile } = this.opts

    for (const t of tasks) {
      if (!t.size || t.size < sliceThresholdBytes) {
        result.push(t)
        continue
      }

      // 已存在且 size 一致,直接放回原任务,Worker 会跳过
      if (fs.existsSync(t.localPath)) {
        try {
          const st = fs.statSync(t.localPath)
          if (st.size === t.size) {
            result.push(t)
            continue
          }
        } catch {
          /* ignore */
        }
      }

      // 计算分片
      let pieceSize = sliceSizeBytes
      let totalSlices = Math.ceil(t.size / pieceSize)
      if (totalSlices > maxSlicesPerFile) {
        totalSlices = maxSlicesPerFile
        pieceSize = Math.ceil(t.size / totalSlices)
      }
      // 分片数 < 2 没必要切
      if (totalSlices < 2) {
        result.push(t)
        continue
      }

      const ctx: SliceContext = {
        remoteAbsPath: t.remoteAbsPath,
        localPath: t.localPath,
        totalSize: t.size,
        totalSlices,
        slicePathPrefix: t.localPath + '.p2p-slice-',
        doneCount: 0,
        finalized: false,
        aborted: false,
      }

      for (let i = 0; i < totalSlices; i++) {
        const start = i * pieceSize
        const end = Math.min(t.size - 1, (i + 1) * pieceSize - 1)
        result.push({
          remoteAbsPath: t.remoteAbsPath,
          localPath: t.localPath,
          size: t.size,
          attempts: 0,
          slice: { index: i, start, end, ctx },
        })
      }
    }

    return result
  }

  private dumpSeedRuntime(): Record<string, SeedRuntime> {
    const out: Record<string, SeedRuntime> = {}
    for (const [k, v] of this.state.seedRuntime.entries()) out[k] = v
    return out
  }

  private getSeedRuntime(seed: Seed): SeedRuntime {
    let rt = this.state.seedRuntime.get(seed.nodeId)
    if (!rt) {
      rt = { failures: 0, disabledUntil: 0 }
      this.state.seedRuntime.set(seed.nodeId, rt)
    }
    return rt
  }

  private isSeedAvailable(seed: Seed): boolean {
    const rt = this.getSeedRuntime(seed)
    if (rt.disabledUntil === 0) return true
    if (Date.now() >= rt.disabledUntil) {
      // 冷静期结束,重置
      rt.disabledUntil = 0
      rt.failures = 0
      const tag = this.opts.logTag || 'p2p-pool'
      console.log(`[${tag}] seed ${seed.nodeName || seed.nodeId} 冷静期结束,重新启用`)
      return true
    }
    return false
  }

  private markSeedFailure(seed: Seed) {
    const rt = this.getSeedRuntime(seed)
    rt.failures += 1
    if (rt.failures >= this.opts.maxFailurePerSeed && rt.disabledUntil === 0) {
      rt.disabledUntil = Date.now() + this.opts.seedCooldownMs
      const tag = this.opts.logTag || 'p2p-pool'
      console.warn(
        `[${tag}] seed ${seed.nodeName || seed.nodeId} 累计失败 ${rt.failures} 次, ` +
        `进入冷静期 ${this.opts.seedCooldownMs}ms`
      )
    }
  }

  /** 单个 worker 的主循环 */
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
        } catch {}
      }

      // 自身不可用 → 短暂休眠等冷静期(若仍有任务,小睡 1s 再判)
      if (!this.isSeedAvailable(seed)) {
        if (this.state.queue.length === 0) return
        await new Promise((r) => setTimeout(r, 1000))
        continue
      }

      const task = this.state.queue.shift()
      if (!task) return

      // 分片任务但其 ctx 已 abort(同文件其他分片致命失败) → 直接丢弃
      if (task.slice?.ctx.aborted) {
        continue
      }

      try {
        const downloadedBytes = await this.processTask(seed, task)
        if (downloadedBytes > 0) {
          this.state.totalDownloadedBytes += downloadedBytes
        }
        if (this.opts.onFileDone && !task.slice) {
          try { this.opts.onFileDone(task) } catch {}
        }
      } catch (err: any) {
        this.markSeedFailure(seed)
        task.attempts += 1
        task.lastError = err?.message || String(err)
        const sliceInfo = task.slice ? ` slice=${task.slice.index}/${task.slice.ctx.totalSlices}` : ''
        console.warn(
          `[${tag}] 下载失败 file=${path.basename(task.remoteAbsPath)}${sliceInfo} ` +
          `seed=${seed.nodeName || seed.nodeId} attempts=${task.attempts}/${this.opts.maxAttemptsPerTask} ` +
          `err=${task.lastError}`
        )

        if (task.attempts >= this.opts.maxAttemptsPerTask) {
          this.state.fatalErrors.push({ task, error: task.lastError || 'unknown' })
          // 如果是分片任务,标记整个文件 abort,清理已下分片
          if (task.slice) {
            task.slice.ctx.aborted = true
            this.cleanupSlices(task.slice.ctx)
          }
        } else {
          this.state.queue.push(task)
        }
      }
    }
  }

  /** 处理单个任务:整文件 or 分片 */
  private async processTask(seed: Seed, task: FileTask): Promise<number> {
    if (task.slice) {
      return this.downloadSlice(seed, task)
    }
    return this.downloadFullFile(seed, task)
  }

  /**
   * 下载整文件(无 Range)
   *  1. 本地已存在且 size 一致(或 size==0 且本地非空)→ 跳过
   *  2. 流式 POST 写到 .p2p-tmp
   *  3. 写完比对 size,不一致抛错重试
   *  4. rename 到目标路径
   */
  private async downloadFullFile(seed: Seed, task: FileTask): Promise<number> {
    const dir = path.dirname(task.localPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    if (fs.existsSync(task.localPath)) {
      const st = fs.statSync(task.localPath)
      if (task.size > 0) {
        if (st.size === task.size) return 0
        try { fs.unlinkSync(task.localPath) } catch {}
      } else if (st.size > 0) {
        return 0
      } else {
        try { fs.unlinkSync(task.localPath) } catch {}
      }
    }

    const tmpPath = task.localPath + '.p2p-tmp'
    if (fs.existsSync(tmpPath)) { try { fs.unlinkSync(tmpPath) } catch {} }

    const writtenBytes = await this.streamToFile(seed, task.remoteAbsPath, tmpPath, undefined)

    if (task.size > 0 && writtenBytes !== task.size) {
      try { fs.unlinkSync(tmpPath) } catch {}
      throw new Error(`size 不一致: 期望=${task.size} 实际=${writtenBytes}`)
    }

    this.atomicRename(tmpPath, task.localPath)
    return writtenBytes
  }

  /**
   * 下载单个分片
   *  1. 本地最终文件已完整存在 → 标记该分片完成(不重复下),并触发合并检查
   *  2. 否则下载到 slicePathPrefix + index
   *  3. 校验分片字节数 = end-start+1
   *  4. doneCount++,若 == totalSlices,本 worker 触发合并(顺序拼接 + rename)
   */
  private async downloadSlice(seed: Seed, task: FileTask): Promise<number> {
    const slice = task.slice!
    const ctx = slice.ctx
    if (ctx.aborted) return 0

    // 终态文件已存在且 size 正确,跳过整组分片
    if (fs.existsSync(ctx.localPath)) {
      const st = fs.statSync(ctx.localPath)
      if (st.size === ctx.totalSize) {
        ctx.finalized = true
        return 0
      }
    }

    const dir = path.dirname(ctx.localPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const slicePath = ctx.slicePathPrefix + slice.index
    if (fs.existsSync(slicePath)) {
      // 残留分片,删掉重下(避免 size 错位)
      try { fs.unlinkSync(slicePath) } catch {}
    }

    const expectBytes = slice.end - slice.start + 1
    const written = await this.streamToFile(
      seed,
      task.remoteAbsPath,
      slicePath,
      { start: slice.start, end: slice.end }
    )

    if (written !== expectBytes) {
      try { fs.unlinkSync(slicePath) } catch {}
      throw new Error(
        `slice ${slice.index} size 不一致: 期望=${expectBytes} 实际=${written}`
      )
    }

    // 该分片完成,累计 doneCount
    ctx.doneCount += 1
    if (ctx.aborted) {
      // 在我们落盘期间被其他分片 abort 了,清理自己
      try { fs.unlinkSync(slicePath) } catch {}
      return written
    }

    if (ctx.doneCount === ctx.totalSlices && !ctx.finalized) {
      ctx.finalized = true
      try {
        await this.mergeSlices(ctx)
      } catch (e: any) {
        // 合并失败 → 整文件 abort
        ctx.aborted = true
        this.cleanupSlices(ctx)
        throw new Error(`分片合并失败: ${e?.message || e}`)
      }
    }

    return written
  }

  /** 顺序合并分片到 .p2p-tmp,然后原子 rename 到 localPath */
  private async mergeSlices(ctx: SliceContext) {
    const tag = this.opts.logTag || 'p2p-pool'
    const tmpPath = ctx.localPath + '.p2p-tmp'
    if (fs.existsSync(tmpPath)) { try { fs.unlinkSync(tmpPath) } catch {} }

    const writer = fs.createWriteStream(tmpPath)
    try {
      for (let i = 0; i < ctx.totalSlices; i++) {
        const slicePath = ctx.slicePathPrefix + i
        if (!fs.existsSync(slicePath)) {
          throw new Error(`分片缺失: index=${i} path=${slicePath}`)
        }
        await new Promise<void>((resolve, reject) => {
          const rd = fs.createReadStream(slicePath)
          rd.on('error', reject)
          rd.on('end', () => resolve())
          rd.pipe(writer, { end: false })
        })
      }
    } catch (e) {
      try { writer.destroy() } catch {}
      try { fs.unlinkSync(tmpPath) } catch {}
      throw e
    }

    await new Promise<void>((resolve, reject) => {
      writer.end((err: any) => (err ? reject(err) : resolve()))
    })

    // size 校验
    const st = fs.statSync(tmpPath)
    if (st.size !== ctx.totalSize) {
      try { fs.unlinkSync(tmpPath) } catch {}
      throw new Error(`合并后 size 不一致: 期望=${ctx.totalSize} 实际=${st.size}`)
    }

    this.atomicRename(tmpPath, ctx.localPath)
    // 清理分片
    this.cleanupSlices(ctx)
    console.log(`[${tag}] 合并完成 ${ctx.localPath} (${ctx.totalSlices} 片)`)
  }

  private cleanupSlices(ctx: SliceContext) {
    for (let i = 0; i < ctx.totalSlices; i++) {
      const slicePath = ctx.slicePathPrefix + i
      if (fs.existsSync(slicePath)) {
        try { fs.unlinkSync(slicePath) } catch {}
      }
    }
  }

  /**
   * 通用:流式下载到指定本地路径
   *  - 不带 range:整文件 200
   *  - 带 range:发送 Range 头,期望 206
   * 返回实际写入字节数
   */
  private async streamToFile(
    seed: Seed,
    remoteAbsPath: string,
    destPath: string,
    range: { start: number; end: number } | undefined
  ): Promise<number> {
    const headers: Record<string, string> = {
      ...this.opts.headers,
      'Content-Type': 'application/json; charset=UTF-8',
    }
    if (range) {
      headers['Range'] = `bytes=${range.start}-${range.end}`
    }

    let res: any
    try {
      res = await axios({
        method: 'post',
        url: `${seed.baseUrl}/p2p/serve/file`,
        headers,
        data: { file: remoteAbsPath },
        responseType: 'stream',
        timeout: this.opts.fileTimeoutMs,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: (s) => s >= 200 && s < 300, // 200 / 206 都接受
      })
    } catch (e) {
      throw e
    }

    if (range && res.status !== 206) {
      try { res.data?.destroy?.() } catch {}
      throw new Error(`期望 206 Partial Content,实际 ${res.status} (对端可能不支持 Range)`)
    }

    let writtenBytes = 0
    const writer = fs.createWriteStream(destPath)

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
        try { fs.unlinkSync(destPath) } catch {}
        reject(new Error(`文件写入失败: ${err.message}`))
      })
      res.data.on('error', (err: any) => {
        try { writer.destroy() } catch {}
        try { fs.unlinkSync(destPath) } catch {}
        reject(err)
      })
    })

    return writtenBytes
  }

  private atomicRename(from: string, to: string) {
    try {
      fs.renameSync(from, to)
    } catch {
      try {
        if (fs.existsSync(to)) fs.unlinkSync(to)
        fs.renameSync(from, to)
      } catch (e2: any) {
        try { fs.unlinkSync(from) } catch {}
        throw new Error(`rename 失败: ${e2.message}`)
      }
    }
  }
}