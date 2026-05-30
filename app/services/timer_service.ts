/*
 * @Author: lkw199711 lkw199711@163.com
 * @Date: 2024-10-08 15:36:23
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2025-01-17 22:09:06
 * @FilePath: \smanga-adonis\app\services\timer_service.ts
 */
let timerId: any = null

let period = 0

function startTimer(interval = 1000) {
  if (!timerId) {
    timerId = setInterval(() => {
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
