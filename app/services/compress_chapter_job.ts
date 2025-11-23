import { unzipFile } from '#utils/unzip'
import { extractRar } from '#utils/unrar'
import { extract7z } from '#utils/un7z'

export default class CompressChapterJob {
  chapterType: string
  chapterPath: string
  compressPath: string
  constructor({
    chapterType,
    chapterPath,
    compressPath,
  }: {
    chapterType: string
    chapterPath: string
    compressPath: string
  }) {
    this.chapterType = chapterType
    this.chapterPath = chapterPath
    this.compressPath = compressPath
  }
  public async run() {
      switch (this.chapterType) {
        case 'zip':
          await unzipFile(this.chapterPath, this.compressPath)
          break
        case 'rar':
          await extractRar(this.chapterPath, this.compressPath)
          break
        case '7z':
          await extract7z(this.chapterPath, this.compressPath)
          break
        default:
          console.log('未知的压缩类型:', this.chapterType)
      }

      console.log(this.chapterPath, '解压完成')
    } catch (error) {
      console.error('解压失败:', this.chapterPath, error)
      throw error // 重新抛出错误，让Bull.js知道任务失败
    }
  }
}
