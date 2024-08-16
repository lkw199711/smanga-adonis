import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { execSync } = require('child_process')

export function runNpxCommand(command: string) {
  try {
    // 执行 npx 命令，并捕获输出
    const output = execSync(command, { stdio: 'inherit' })
    console.log('命令执行成功')
    return true
  } catch (error) {
    console.error('命令执行失败:', error.message)
    return false
  }
}
