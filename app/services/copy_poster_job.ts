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
    }
}