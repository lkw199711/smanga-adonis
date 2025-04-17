import { createRequire } from 'module'
const require = createRequire(import.meta.url)
// @ts-ignore
const cron = require('node-cron');
import { get_config } from '#utils/index'
import prisma from '#start/prisma'
import { addTask } from './queue_service.js';
import { TaskPriority } from '#type/index'

let scanCron: any = { stop: () => { } }

function create_scan_cron() {
    // 停止旧扫描任务
    scanCron.stop()
    // 获取配置
    const config = get_config()
    const scanInterval = config.scan.interval
    // 定时扫描任务
    try {
        scanCron = cron.schedule(scanInterval, async () => {
            const paths = await prisma.path.findMany()
            const autoScanPaths = paths.filter((path: any) => path.autoScan == 1 && path.deleteFlag == 0)
            autoScanPaths.forEach((path: any) => {
                addTask({
                    taskName: `scan_path_${path.pathId}`,
                    command: 'taskScanPath',
                    args: { pathId: path.pathId },
                    priority: TaskPriority.scan,
                })
            })
        });
    } catch (e) {
        console.error('部署corn扫描任务失败', e)
    }

}

/*
        console.log('执行cron任务')
        await prisma.scan.create({
            data: {
                scanStatus: 'auto',
                pathId: Math.floor(Math.random() * 1000),
                pathContent: 'C:/Users/lenovo/Desktop/漫画',
            },
        })
*/

export { create_scan_cron }