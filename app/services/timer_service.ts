// timer.js
import TaskProcess from '#services/task_service'
import clear_scan from '#services/clear_scan_service'

let timerId: any = null

// 启动任务队列处理器
let period = 0
const taskProcess = new TaskProcess()

function startTimer(interval = 1000) {
  if (!timerId) {
    timerId = setInterval(() => {
      // 每个周期执行
      taskProcess.handleTaskQueue()
      // 每十个周期执行
      if (period % 10) {
        clear_scan()
      }
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