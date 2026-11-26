import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'

export type StorageRootCheckCode =
  | 'AVAILABLE'
  | 'NOT_FOUND'
  | 'NOT_DIRECTORY'
  | 'PERMISSION_DENIED'
  | 'INVALID_PATH'
  | 'UNKNOWN_ERROR'

export interface StorageRootCheckResult {
  available: boolean
  status: 'available' | 'unavailable'
  code: StorageRootCheckCode
  message: string
  normalizedPath: string
  checkedAt: Date
}

export class InvalidStorageRootPathError extends Error {}

export function normalizeStorageRootPath(value: string): string {
  const source = String(value ?? '').trim()
  if (!source) throw new InvalidStorageRootPathError('存储根路径不能为空')
  if (!path.isAbsolute(source)) {
    throw new InvalidStorageRootPathError('存储根路径必须是服务器上的绝对路径')
  }

  const normalized = path.normalize(source)
  const filesystemRoot = path.parse(normalized).root
  if (normalized === filesystemRoot) return normalized
  return normalized.replace(/[\\/]+$/, '')
}

export function storageRootPathComparisonKey(value: string): string {
  const normalized = normalizeStorageRootPath(value)
  return process.platform === 'win32' ? normalized.toLocaleLowerCase() : normalized
}

export async function checkStorageRootPath(value: string): Promise<StorageRootCheckResult> {
  const checkedAt = new Date()
  let normalizedPath = String(value ?? '').trim()

  try {
    normalizedPath = normalizeStorageRootPath(value)
  } catch (error) {
    return {
      available: false,
      status: 'unavailable',
      code: 'INVALID_PATH',
      message: error instanceof Error ? error.message : '存储根路径无效',
      normalizedPath,
      checkedAt,
    }
  }

  try {
    const stat = await fs.stat(normalizedPath)
    if (!stat.isDirectory()) {
      return {
        available: false,
        status: 'unavailable',
        code: 'NOT_DIRECTORY',
        message: '路径存在，但不是目录',
        normalizedPath,
        checkedAt,
      }
    }

    await fs.access(normalizedPath, fsConstants.R_OK)
    return {
      available: true,
      status: 'available',
      code: 'AVAILABLE',
      message: '目录可访问',
      normalizedPath,
      checkedAt,
    }
  } catch (error: any) {
    const code = String(error?.code || '')
    if (code === 'ENOENT') {
      return {
        available: false,
        status: 'unavailable',
        code: 'NOT_FOUND',
        message: '目录不存在或挂载尚未就绪',
        normalizedPath,
        checkedAt,
      }
    }
    if (code === 'EACCES' || code === 'EPERM') {
      return {
        available: false,
        status: 'unavailable',
        code: 'PERMISSION_DENIED',
        message: 'Smanga 没有读取该目录的权限',
        normalizedPath,
        checkedAt,
      }
    }

    return {
      available: false,
      status: 'unavailable',
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : '目录检测失败',
      normalizedPath,
      checkedAt,
    }
  }
}

export function storageRootKeyBase(rootName: string, providerKey: string): string {
  const source = `${providerKey || 'custom'}-${rootName || 'storage-root'}`
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 52)

  return source || 'storage-root'
}
