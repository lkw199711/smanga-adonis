/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-10-08 15:36:23
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-01-17 22:09:06
 * @FilePath: \smanga-adonis\app\services\timer_service.ts
 */
// timer.js
import TaskProcess from '#services/task_service'

let timerId: any = null

// 启动任务队列处理器
let period = 0
const taskProcess = new TaskProcess()

function startTimer(interval = 1000) {
  if (!timerId) {
    timerId = setInterval(() => {
      // 每个周期执行
      taskProcess.handleTaskQueue()
      period++
    }, interval)
    console.log(`定时器已启动，ID: ${timerId}`)
  }
}

setInterval(() => {
  
}, 1000)

function stopTimer() {
  if (timerId) {
    clearInterval(timerId)
    console.log(`定时器已停止，ID: ${timerId}`)
    timerId = null
  }
}

function getTimerId() {
  return timerId
}

export { startTimer, stopTimer, getTimerId }