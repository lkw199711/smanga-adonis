import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { path_cache, s_delete } from '#utils/index'
import { compressImageToSize } from '#utils/sharp'
import { isWithinLibraryDirectory, libraryPathContextForPathId } from '#services/library_path_service'

export default class CopyPosterJob {
    inputPath: string
    outputPath: string
    maxSizeKB: number
    pathId?: number

    constructor({ inputPath, outputPath, maxSizeKB, pathId }: {
        inputPath: string; outputPath: string; maxSizeKB: number; pathId?: number
    }) {
        this.inputPath = inputPath
        this.outputPath = outputPath
        this.maxSizeKB = maxSizeKB
        this.pathId = pathId
    }

    async run() {
        let inputPath = this.inputPath
        if (this.pathId) {
            const libraryPath = await libraryPathContextForPathId(this.pathId)
            inputPath = libraryPath.resolveDataPath(inputPath)
        }
        await mkdir(path.dirname(this.outputPath), { recursive: true })
        await compressImageToSize(inputPath, this.outputPath, this.maxSizeKB)
        // 删除输入缓存源文件
        if (/^smanga_cache_/.test(path.basename(inputPath)) && isWithinLibraryDirectory(path_cache(), inputPath)) {
            s_delete(inputPath)
        }
    }
}
