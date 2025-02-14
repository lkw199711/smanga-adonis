/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2025-02-14 15:49:08
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-02-15 03:47:06
 * @FilePath: \smanga-adonis\app\services\create_media_poster_job.ts
 */
import prisma from '#start/prisma';
import { createCanvas, loadImage } from 'canvas'
import { path_poster } from '#utils/index';
import * as fs from 'fs'
import * as path from 'path'

export default async function handle({ mediaId }: any) {
    const mangas = await prisma.manga.findMany({
        where: {
            mediaId,
            mangaCover: { not: null },
        },
        take: 4,
        select: { mangaId: true, mangaName: true, mangaCover: true },
    })

    if (!mangas.length) return

    const imagePaths = mangas.map(manga => manga.mangaCover) as string[] // 图片路径
    const outputPath = path.join(path_poster(), `smanga-media-${mediaId}.jpg`) // 合并后的图片路径
    // 生成封面
    mergeImages(imagePaths, outputPath, 60, 90)
    await prisma.media.update({
        where: { mediaId },
        data: { mediaCover: outputPath },
    })

    return outputPath;
}

async function mergeImages(imagePaths: string[], outputPath: string, targetWidth: number, targetHeight: number) {
    const gap = 2;
    // 加载图片
    const images = await Promise.all(imagePaths.map(path => loadImage(path)));

    // 计算合并后的画布宽度和最大高度
    const totalWidth = images.length * targetWidth + (images.length - 1) * gap; // 每张图片使用目标宽度
    const maxHeight = targetHeight; // 使用目标高度

    // 创建画布
    const canvas = createCanvas(totalWidth, maxHeight);
    const ctx = canvas.getContext('2d');

    // 绘制图片
    let xOffset = 0;
    images.forEach(image => {
        // 绘制缩放后的图片
        ctx.drawImage(image, xOffset, 0, targetWidth, targetHeight); // 水平合并
        xOffset += (targetWidth + gap); // 更新横坐标偏移量
    });

    // 保存合并后的图片
    const buffer: any = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    console.log('合并完成，保存至', outputPath);
}