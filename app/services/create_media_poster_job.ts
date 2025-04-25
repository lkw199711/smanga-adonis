/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2025-02-14 15:49:08
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-02-15 14:24:42
 * @FilePath: \smanga-adonis\app\services\create_media_poster_job.ts
 */
import prisma from '#start/prisma';
import { path_poster } from '#utils/index';
import sharp from 'sharp';
import * as path from 'path'
import { media_cover_log } from '#utils/log';

export default class CreateMediaPosterJob {
  private mediaId: number

  constructor({ mediaId }: { mediaId: number }) {
    this.mediaId = mediaId
  }

  async run() {
    const mangas = await prisma.manga.findMany({
      where: {
        mediaId: this.mediaId,
        mangaCover: { not: null },
      },
      take: 4,
      select: { mangaId: true, mangaName: true, mangaCover: true },
      orderBy: { updateTime: 'desc' },
    })

    if (!mangas.length) return

    const imagePaths = mangas.filter(manga => manga.mangaCover)
      .map(manga => manga.mangaCover) as string[] // 图片路径
    const outputPath = path.join(path_poster(), `smanga-media-${this.mediaId}.jpg`) // 合并后的图片路径
    // 生成封面
    await mergeImages(imagePaths, outputPath, 60, 90)
    const media = await prisma.media.findUnique({ where: { mediaId: this.mediaId } })
    await prisma.media.update({
      where: { mediaId: this.mediaId },
      data: { mediaCover: outputPath },
    })

    // 记录日志
    media_cover_log({ mediaId: this.mediaId, mediaName: media?.mediaName, mediaCover: outputPath })

    return outputPath;
  }
}

async function mergeImages(imagePaths: string[], outputPath: string, targetWidth: number, targetHeight: number, gap: number = 2) {
  const images = imagePaths.map(imagePath => sharp(imagePath).resize(targetWidth, targetHeight).toBuffer());

  try {
    const buffers = await Promise.all(images);

    // 创建合并后的图像
    const composite = await sharp({
      create: {
        width: (targetWidth + gap) * images.length - gap, // 总宽度，减去最后一个间隙
        height: targetHeight, // 高度
        channels: 4, // RGBA
        background: { r: 0, g: 0, b: 0, alpha: 1 } // 黑色背景
      }
    })
      .composite(buffers.map((buffer, index) => ({
        input: buffer,
        top: 0,
        left: index * (targetWidth + gap) // 水平排列，考虑间隙
      })))
      .toFile(outputPath); // 保存合并后的图像

    console.log('合并完成，保存至', outputPath);
  } catch (error) {
    console.error('合并图片时出错:', error);
  }
}