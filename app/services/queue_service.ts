/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2025-01-17 15:45:01
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-03-13 20:16:08
 * @FilePath: \smanga-adonis\start\queue.ts
 */
import ScanPathJob from './scan_job.js'
import ScanMangaJob from './scan_manga_job.js'
import DeleteChapterJob from './delete_chapter_job.js'
import DeleteMangaJob from './delete_manga_job.js'
import DeletePathJob from './delete_path_job.js'
import DeleteMediaJob from './delete_media_job.js'
import CopyPosterJob from './copy_poster_job.js'
import CreateMediaPosterJob from './create_media_poster_job.js'
import { get_config } from '#utils/index'

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
        case 'taskScanPath':
            //扫描任务调用
            console.log('执行扫描任务')
            await new ScanPathJob(args).run()
            break
        case 'taskScanManga':
            console.log('执行扫描漫画任务')
            //扫描漫画任务调用
            await new ScanMangaJob(args).run()
            break
        case 'deleteMedia':
            //删除媒体库
            console.log('删除媒体库')
            await new DeleteMediaJob(args).run()
            break
        case 'deletePath':
            //删除路径
            console.log('删除路径')
            await new DeletePathJob(args).run()
            break
        case 'deleteManga':
            //删除漫画
            console.log('删除漫画')
            await new DeleteMangaJob(args).run()
            break
        case 'deleteChapter':
            //删除章节
            console.log('删除章节')
            await new DeleteChapterJob(args).run()
            break
        case 'copyPoster':
            await new CopyPosterJob(args).run();
            break
        case 'compressChapter':
            //压缩章节
            console.log('压缩章节')
            // await compress_chapter_job(args)
            break
        case 'createMediaPoster':
            //生成媒体库封面
            console.log('生成媒体库封面')
            await new CreateMediaPosterJob(args).run()
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

async function path_scanning(pathId: number) {

    const wattingJobs = await scanQueue.getWaiting()
    const activeJobs = await scanQueue.getActive()
    const jobs = wattingJobs.concat(activeJobs)
    const thisPathJobs = jobs.filter((job: any) => job.data.taskName === `scan_path_${pathId}`)
    if (thisPathJobs.length > 0) {
        return true
    }

    return false
}

async function path_deleting(pathId: number) {

    const wattingJobs = await scanQueue.getWaiting()
    const activeJobs = await scanQueue.getActive()
    const jobs = wattingJobs.concat(activeJobs)
    const thisPathJobs = jobs.filter((job: any) => job.data.taskName === `delete_path_${pathId}`)
    if (thisPathJobs.length > 0) {
        return true
    }

    return false
}

async function addTask({ taskName, command, args, priority, timeout }: any) {
    // console.log(`添加任务: ${taskName}, 命令: ${command}, 参数: ${JSON.stringify(args)}, 优先级: ${priority}, 超时: ${timeout}`);
    console.log(`添加任务: ${taskName}`);

    // 才用同步还是异步的方式执行扫描任务
    const config = get_config()
    const dispatchSync = config.debug.dispatchSync == 1
    if (dispatchSync) {
        switch (command) {
            case 'taskScanPath':
                await new ScanPathJob(args).run()
                break
            case 'taskScanManga':
                await new ScanMangaJob(args).run()
                break
            case 'deleteMedia':
                await new DeleteMediaJob(args).run()
                break
            case 'deletePath':
                await new DeletePathJob(args).run()
                break
            case 'deleteManga':
                await new DeleteMangaJob(args).run()
                break
            case 'deleteChapter':
                await new DeleteChapterJob(args).run()
                break
            case 'copyPoster':
                await new CopyPosterJob(args).run()
                break
            case 'compressChapter':
                //压缩章节
                // compress_chapter_job(args)
                break
            case 'createMediaPoster':
                await new CreateMediaPosterJob(args).run()
                break
            default:
                break
        }
    } else {
        if (command === 'taskScanPath') {
            if (await path_scanning(args.pathId)) {
                console.log(`路径${args.pathId} 正在被扫描,跳过执行`)
                return false
            }
        } else if (command === 'deletePath') {
            if (await path_deleting(args.pathId)) {
                console.log(`路径${args.pathId} 正在被删除,跳过执行`)
                return false
            }
        }

        scanQueue.add({
            taskName,
            command,
            args
        }, {
            priority,
            timeout
        })
    }

}

export { scanQueue, deleteQueue, compressQueue, addTask, path_scanning, path_deleting };