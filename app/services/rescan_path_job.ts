import ScanPathJob from './scan_job.js'

export default class RescanPathJob {
  constructor(private args: { pathId: number; scanRunId?: number }) {}

  async run() {
    await new ScanPathJob({ ...this.args, rebuild: true }).run()
  }
}
