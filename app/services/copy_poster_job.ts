import { s_delete } from '#utils/index'
import { compressImageToSize } from '#utils/sharp'

export default class CopyPosterJob {
    inputPath: string
    outputPath: string
    maxSizeKB: number

    constructor({ inputPath, outputPath, maxSizeKB }: { inputPath: string; outputPath: string; maxSizeKB: number }) {
        this.inputPath = inputPath
        this.outputPath = outputPath
        this.maxSizeKB = maxSizeKB
    }

    async run() {
        await compressImageToSize(this.inputPath, this.outputPath, this.maxSizeKB)
        // 删除输入缓存源文件
        if (/smanga_cache/.test(this.inputPath)) s_delete(this.inputPath)
    }
}