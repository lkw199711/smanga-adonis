/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-08-03 05:28:15
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-11 02:47:18
 * @FilePath: \smanga-adonis\app\services\clear_scan_service.ts
 */
import prisma from '#start/prisma'

export default async function clear_scan() {
    const scanRecords = await prisma.scan.findMany()
    if (scanRecords.length === 0) {
      return
    }
    
    /**
     * 遍历扫描记录
     * 检查是否有正在扫描的任务
     * 没有则删除扫描记录
     */
    scanRecords.forEach(async (scanRecord: any) => { 
        const pathId = scanRecord.pathId
        const taskName = `scan_${pathId}`
        const tasks = await prisma.task.findMany({ where: { taskName } })

        if(!tasks.length) await prisma.scan.delete({ where: { pathId } })
    })
}
