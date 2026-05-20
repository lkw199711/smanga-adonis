/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-10-08 15:36:23
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-01-17 22:09:06
 * @FilePath: \smanga-adonis\app\services\timer_service.ts
 */
// timer.js
import TaskProcess from '#services/task_service'
import log from '#services/log_service'

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
    void log.info({
      type: 'task',
      module: 'timer',
      action: 'timer.started',
      message: `定时器已启动，ID: ${timerId}`,
      context: { timerId: String(timerId), interval },
    })
  }
}

setInterval(() => {
  
}, 1000)

function stopTimer() {
  if (timerId) {
    clearInterval(timerId)
    void log.info({
      type: 'task',
      module: 'timer',
      action: 'timer.stopped',
      message: `定时器已停止，ID: ${timerId}`,
      context: { timerId: String(timerId) },
    })
    timerId = null
  }
}

function getTimerId() {
  return timerId
}

export { startTimer, stopTimer, getTimerId }
