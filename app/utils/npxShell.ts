/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-08-14 18:52:19
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-21 11:49:07
 * @FilePath: \smanga-adonis\app\utils\npxShell.ts
 */
import { createRequire } from 'module'
import * as fs from 'node:fs'
import * as path from 'node:path'
const require = createRequire(import.meta.url)
const { execSync } = require('child_process')

/**
 * 执行 npx 命令，返回 { success, error }
 * 执行前自动清理 node_modules/.prisma 缓存，避免 Windows EPERM
 */
export function runNpxCommand(command: string): { success: boolean; error?: string } {
  try {
    // 清理 Prisma 生成缓存，解决 Windows 下 DLL 文件被锁的问题
    const rootDir = process.cwd()
    const prismaCacheDir = path.join(rootDir, 'node_modules', '.prisma', 'client')
    if (fs.existsSync(prismaCacheDir)) {
      try {
        fs.rmSync(prismaCacheDir, { recursive: true, force: true })
      } catch {
        // 清理失败不阻塞，生成命令会尝试覆盖
      }
    }

    execSync(command, { stdio: 'pipe', timeout: 300000 })
    return { success: true }
  } catch (error: any) {
    const stderr = error.stderr?.toString() || ''
    const message = error.message?.toString() || ''
    // 取 stderr 最后几行作为简洁的错误信息
    const lines = (stderr || message).split('\n').filter((l: string) => l.trim())
    const brief = lines.slice(-3).join(' → ')
    console.error('命令执行失败:', brief || message)
    return { success: false, error: brief || message }
  }
}
