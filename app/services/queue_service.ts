/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2025-01-17 15:45:01
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-02-15 02:59:27
 * @FilePath: \smanga-adonis\start\queue.ts
 */
import scan_job from './scan_job.js'
import scan_manga_job from './scan_manga_job.js'
import delete_chapter_job from './delete_chapter_job.js'
import delete_manga_job from './delete_manga_job.js'
import delete_path_job from './delete_path_job.js'
import delete_media_job from './delete_media_job.js'
import copy_poster_job from './copy_poster_job.js'
import create_media_poster_job from './create_media_poster_job.js'

import Bull from 'bull'
const scanQueue = new Bull('smanga', {
    redis: {
        host: '127.0.0.1',
        port: 6379,
    },
});

scanQueue.on('completed', (job) => {
    console.log(`Job completed: ${job.id}`);
});

scanQueue.on('failed', (job, err) => {
    console.error(`Job failed: ${job.id} with error: ${err.message}`);
});

scanQueue.process(2, async (job: any) => {
    const { command, args } = job.data;

    switch (command) {
        case 'taskScan':
            //扫描任务调用
            console.log('执行扫描任务')
            await scan_job(args)
            break
        case 'taskScanManga':
            console.log('执行扫描漫画任务')
            //扫描漫画任务调用
            await scan_manga_job(args)
            break
        case 'deleteMedia':
            //删除媒体库
            console.log('删除媒体库')
            await delete_media_job(args)
            break
        case 'deletePath':
            //删除路径
            console.log('删除路径')
            await delete_path_job(args)
            break
        case 'deleteManga':
            //删除漫画
            console.log('删除漫画')
            await delete_manga_job(args)
            break
        case 'deleteChapter':
            //删除章节
            console.log('删除章节')
            await delete_chapter_job(args)
            break
        case 'copyPoster':
            await copy_poster_job(args);
            break
        case 'compressChapter':
            //压缩章节
            console.log('压缩章节')
            // await compress_chapter_job(args)
            break
        case 'createMediaPoster':
            //生成媒体库封面
            console.log('生成媒体库封面')
            await create_media_poster_job(args)
            break
        default:
            break
    }

    return true;
});

const deleteQueue = new Bull('smanga', {
    redis: {
        host: '127.0.0.1',
        port: 6379,
    }
});

const compressQueue = new Bull('smanga', {
    redis: {
        host: '127.0.0.1',
        port: 6379,
    }
});

export { scanQueue, deleteQueue, compressQueue };