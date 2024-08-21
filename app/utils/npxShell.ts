/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-08-14 18:52:19
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-21 11:49:07
 * @FilePath: \smanga-adonis\app\utils\npxShell.ts
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { execSync } = require('child_process')

export function runNpxCommand(command: string) {
  try {
    // 执行 npx 命令，并捕获输出
    execSync(command, { stdio: 'inherit' })
    console.log('命令执行成功')
    return true
  } catch (error) {
    console.error('命令执行失败:', error.message)
    return false
  }
}
