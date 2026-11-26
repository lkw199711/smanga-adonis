import fs from 'node:fs'
import path from 'node:path'
import prisma from '#start/prisma'
import { path_cache, path_meta, path_poster } from '#utils/index'

export type StorageRootLike = {
  storageRootId: number
  rootPath: string
  rootName?: string | null
  enabled: number
  deleteFlag: number
}

export type PathWithStorageRoot = {
  storageRootId?: number | null
  storageRoot?: StorageRootLike | null
}

export class LibraryPathError extends Error {}

function comparisonKey(value: string) {
  const normalized = path.normalize(value)
  return process.platform === 'win32' ? normalized.toLocaleLowerCase() : normalized
}

export function normalizeRelativeLibraryPath(value: string): string {
  const source = String(value ?? '')
  if (!source || source === '.') return '.'
  if (path.win32.isAbsolute(source) || path.posix.isAbsolute(source) || /^[a-z]:/i.test(source)) {
    throw new LibraryPathError('绑定存储根后，目录路径必须填写相对于存储根的相对路径')
  }

  // 数据库统一使用 /，避免数据库在 Windows 与 Linux 间迁移时失效。
  const portable = source.replace(/\\/g, '/')
  if (portable.split('/').includes('..') || portable.includes('\0')) {
    throw new LibraryPathError('相对路径不能超出存储根目录')
  }
  return path.posix.normalize(portable).replace(/\/+$/, '') || '.'
}

export class LibraryPathContext {
  readonly storageRootId: number | null
  readonly rootPath: string | null

  constructor(record?: PathWithStorageRoot | null) {
    this.storageRootId = record?.storageRootId ?? null
    if (!this.storageRootId) {
      this.rootPath = null
      return
    }

    const root = record?.storageRoot
    if (!root || root.storageRootId !== this.storageRootId) {
      throw new LibraryPathError('路径绑定的存储根不存在')
    }
    if (root.deleteFlag === 1) throw new LibraryPathError('路径绑定的存储根已删除')
    if (root.enabled !== 1) throw new LibraryPathError('路径绑定的存储根已停用')
    this.rootPath = path.resolve(root.rootPath)
  }

  get usesStorageRoot() {
    return this.rootPath !== null
  }

  resolve(storedPath: string): string {
    if (!this.rootPath) return storedPath
    const relativePath = normalizeRelativeLibraryPath(storedPath)
    const resolved = path.resolve(
      this.rootPath,
      ...(relativePath === '.' ? [] : relativePath.split('/'))
    )
    this.assertWithinRoot(resolved)
    return resolved
  }

  scanDirectory(storedPath: string): string {
    const directory = this.resolve(storedPath)
    if (this.rootPath) {
      try {
        const root = fs.realpathSync(this.rootPath)
        const target = fs.realpathSync(directory)
        if (isWithinLibraryDirectory(root, target) && fs.statSync(target).isDirectory()) {
          return directory
        }
      } catch {
        throw new LibraryPathError('扫描目录无法访问，请检查存储根和挂载状态')
      }
      throw new LibraryPathError('扫描目录必须是存储根内的目录')
    }
    return directory
  }

  toStored(physicalPath: string): string {
    if (!this.rootPath) return physicalPath
    const resolved = path.resolve(physicalPath)
    this.assertWithinRoot(resolved)
    const relativePath = path.relative(this.rootPath, resolved).split(path.sep).join('/')
    return relativePath || '.'
  }

  /** 数据字段可同时引用媒体根内文件和 Smanga 自身缓存文件。 */
  resolveDataPath(storedPath: string): string {
    if (!this.rootPath || path.isAbsolute(storedPath)) return storedPath
    return this.resolve(storedPath)
  }

  /** 根内文件保存相对路径；根外的 Smanga 缓存文件继续保存绝对路径。 */
  toStoredDataPath(physicalPath: string): string {
    if (!this.rootPath) return physicalPath
    const resolved = path.resolve(physicalPath)
    if ([path_cache(), path_meta(), path_poster()].some(dir => isWithinLibraryDirectory(dir, resolved))) {
      return resolved
    }
    if (isWithinLibraryDirectory(this.rootPath, resolved)) {
      return this.toStored(resolved)
    }
    return resolved
  }

  private assertWithinRoot(candidate: string) {
    if (!this.rootPath) return
    if (!isWithinLibraryDirectory(this.rootPath, candidate)) {
      throw new LibraryPathError('路径超出绑定的存储根目录')
    }
  }
}

export function isWithinLibraryDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(comparisonKey(root), comparisonKey(candidate))
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)
}

export async function libraryPathContextForPathId(pathId: number): Promise<LibraryPathContext> {
  const pathInfo = await prisma.path.findUnique({
    where: { pathId },
    include: { storageRoot: true },
  })
  return new LibraryPathContext(pathInfo)
}
