import prisma from '#start/prisma';
import { path_poster } from '#utils/index';
import sharp from 'sharp';
import * as path from 'path'
import fs from 'fs';
import { error_log, media_cover_log } from '#utils/log';
import { media } from '@prisma/client';

export default class CreateMediaPosterJob {
  private mediaId: number
  private mediaInfo: media | null = null
  private mangaCovers: string[] = [] // 存储封面路径
  private targetWidth = 60 // 目标宽度
  private targetHeight = 90 // 目标高度
  private gap = 2 // 图片间隙
  private outputPath: string = ''// 合并后的图片路径

  constructor({ mediaId }: { mediaId: number }) {
    this.mediaId = mediaId
  }

  async run() {
    const mangas = await prisma.manga.findMany({
      where: {
        mediaId: this.mediaId,
        mangaCover: { not: '' },
      },
      take: 10,
      select: { mangaId: true, mangaName: true, mangaCover: true },
      orderBy: { updateTime: 'desc' },
    })

    if (!mangas.length) return

    this.mangaCovers = mangas
      .filter(manga => fs.existsSync(manga.mangaCover || ''))
      .map(manga => manga.mangaCover) as string[] // 图片路径
    this.outputPath = path.join(path_poster(), `smanga_media_${this.mediaId}.jpg`) // 合并后的图片路径
    // 生成封面
    const images: Buffer[] = []
    for (let i = 0; i < this.mangaCovers.length; i++) {
      const imagePath = this.mangaCovers[i];
      await sharp(imagePath).resize(this.targetWidth, this.targetHeight).toBuffer()
        .then(buffer => images.push(buffer)) // 将每个图片的缓冲区添加到数组中
        .catch(err => { error_log('[media poster]', `处理图片 ${imagePath} 时出错:${err}`); })

      if (images.length >= 4) break; // 限制最多处理 4 张图片
    }

    if (images.length === 0) return;

    if (images.length < 4) { 
      // 如果少于4张图片，复制最后一张图片直到有4张
      const lastImage = images[images.length - 1];
      while (images.length < 4) { 
        images.push(lastImage);
      }
    }

    try {
      // 创建合并后的图像
      await sharp({
        create: {
          width: (this.targetWidth + this.gap) * images.length - this.gap, // 总宽度，减去最后一个间隙
          height: this.targetHeight, // 高度
          channels: 4, // RGBA
          background: { r: 0, g: 0, b: 0, alpha: 1 } // 黑色背景
        }
      })
        .composite(images.map((buffer, index) => ({
          input: buffer,
          top: 0,
          left: index * (this.targetWidth + this.gap) // 水平排列，考虑间隙
        })))
        .toFile(this.outputPath); // 保存合并后的图像

      // 记录日志
      media_cover_log({ mediaId: this.mediaId, mediaName: this.mediaInfo?.mediaName, mediaCover: this.outputPath })

      this.mediaInfo = await prisma.media.findUnique({ where: { mediaId: this.mediaId } })
      await prisma.media.update({
        where: { mediaId: this.mediaId },
        data: { mediaCover: this.outputPath },
      })
      return this.outputPath;
    } catch (error) {
      return false;
    }
  }
}

