import { createHash } from 'node:crypto'
import { constants as fsConstants, createReadStream, type Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

export type DirectoryMigrationInput = {
  sourcePath: string
  targetPath: string
  mirrorDelete?: boolean
  deleteSource?: boolean
}

export type DirectoryMigrationCopyInput = Pick<DirectoryMigrationInput, 'sourcePath' | 'targetPath'> & {
  relativePath: string
  runId: string
  recoverPartials?: boolean
  pendingFile?: PendingCopyFile | null
}

type PendingCopyFile = {
  name: string
  identity?: { dev: string; ino: string }
}

type SavePendingCopy = (file: PendingCopyFile | null) => Promise<void>

type SourceCleanupCheckpoint = {
  started: boolean
  save: () => Promise<void>
}

export type DirectoryAccessResult = {
  available: boolean
  path: string
  resolvedPath?: string
  message: string
}

export type DirectoryMigrationCheck = {
  available: boolean
  source: DirectoryAccessResult
  target: DirectoryAccessResult
  message: string
}

export type DirectoryMigrationStats = {
  copiedFiles: number
  skippedFiles: number
  createdDirectories: number
  deletedFiles: number
  deletedDirectories: number
  deletedSourceFiles: number
}

function normalizeDirectory(value: string) {
  const input = String(value ?? '').trim()
  if (!input) throw new Error('目录不能为空')
  if (!path.isAbsolute(input)) throw new Error('必须填写 Smanga 服务端可见的绝对路径')
  return path.normalize(input)
}

async function inspectDirectory(value: string, writable: boolean): Promise<DirectoryAccessResult> {
  let normalized = String(value ?? '').trim()
  try {
    normalized = normalizeDirectory(value)
    const stat = await fs.stat(normalized)
    if (!stat.isDirectory()) {
      return { available: false, path: normalized, message: '路径存在，但不是目录' }
    }
    await fs.access(normalized, writable ? fsConstants.R_OK | fsConstants.W_OK : fsConstants.R_OK)
    // access() 在部分网络文件系统上并不能保证目录可枚举，再做一次真实读取。
    const directory = await fs.opendir(normalized)
    try {
      await directory.read()
    } finally {
      await directory.close()
    }
    const resolvedPath = await fs.realpath(normalized)
    return {
      available: true,
      path: normalized,
      resolvedPath,
      message: writable ? '目录可读写' : '目录可读取',
    }
  } catch (error: any) {
    const code = String(error?.code || '')
    let message = error instanceof Error ? error.message : '目录检测失败'
    if (code === 'ENOENT') message = '目录不存在或挂载尚未就绪'
    else if (code === 'EACCES' || code === 'EPERM') {
      message = writable ? 'Smanga 没有读取或写入该目录的权限' : 'Smanga 没有读取该目录的权限'
    }
    return { available: false, path: normalized, message }
  }
}

export async function createMigrationTarget(value: string): Promise<DirectoryAccessResult> {
  let targetPath = value
  try {
    targetPath = normalizeDirectory(value)
    const created = await fs.mkdir(targetPath, { recursive: true })
    const check = await inspectDirectory(targetPath, true)
    if (!check.available) return { ...check, message: `目标目录不可访问：${check.message}` }
    return { ...check, message: created ? '目标目录已创建，可读写' : '目标目录已存在，可读写' }
  } catch (error: any) {
    let message = error instanceof Error ? error.message : '创建失败'
    if (error?.code === 'EEXIST' || error?.code === 'ENOTDIR') {
      message = '目标路径或它的上级路径已被文件占用'
    } else if (['EACCES', 'EPERM', 'EROFS'].includes(error?.code)) {
      message = '目标位置不可写或 Smanga 没有创建目录的权限'
    } else if (error?.code === 'ENOENT') {
      message = '找不到目标位置，请检查盘符或网盘挂载'
    }
    return { available: false, path: targetPath, message: `无法创建目标目录：${message}` }
  }
}

function comparisonKey(value: string) {
  const normalized = path.resolve(value)
  return process.platform === 'win32' ? normalized.toLocaleLowerCase() : normalized
}

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export function directoryMigrationsConflict(next: DirectoryMigrationInput, queued: DirectoryMigrationInput) {
  if (typeof queued?.sourcePath !== 'string' || typeof queued.targetPath !== 'string') return false
  const nextPaths = [comparisonKey(next.sourcePath), comparisonKey(next.targetPath)]
  const queuedPaths = [comparisonKey(queued.sourcePath), comparisonKey(queued.targetPath)]
  const overlaps = (left: string, right: string) =>
    left === right || isInside(left, right) || isInside(right, left)
  if (overlaps(nextPaths[1], queuedPaths[1])) return true
  return (next.deleteSource === true || queued.deleteSource === true ||
    next.mirrorDelete === true || queued.mirrorDelete === true) &&
    nextPaths.some((left) => queuedPaths.some((right) => overlaps(left, right)))
}

export async function checkDirectoryMigrationPaths(
  { sourcePath, targetPath, mirrorDelete, deleteSource }: DirectoryMigrationInput
): Promise<DirectoryMigrationCheck> {
  const [source, target] = await Promise.all([
    inspectDirectory(sourcePath, deleteSource === true),
    inspectDirectory(targetPath, true),
  ])

  if (!source.available || !target.available || !source.resolvedPath || !target.resolvedPath) {
    return {
      available: false,
      source,
      target,
      message: !source.available ? `源目录不可访问：${source.message}` : `目标目录不可访问：${target.message}`,
    }
  }

  const sourceKey = comparisonKey(source.resolvedPath)
  const targetKey = comparisonKey(target.resolvedPath)
  if (sourceKey === targetKey) {
    return { available: false, source, target, message: '源目录和目标目录不能相同' }
  }
  if (isInside(sourceKey, targetKey) || isInside(targetKey, sourceKey)) {
    return { available: false, source, target, message: '源目录和目标目录不能互相包含' }
  }

  if (mirrorDelete && comparisonKey(path.parse(targetKey).root) === targetKey) {
    return { available: false, source, target, message: '为避免误删，镜像同步的目标不能是文件系统根目录' }
  }
  if (deleteSource && comparisonKey(path.parse(sourceKey).root) === sourceKey) {
    return { available: false, source, target, message: '删除源文件时，源目录不能是文件系统根目录' }
  }

  return { available: true, source, target, message: '源目录和目标目录均可访问' }
}

async function existingType(target: string) {
  try {
    return await fs.lstat(target)
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

export async function planDirectoryCopies(source: string) {
  const directories = ['']
  for (const relativePath of directories) {
    const directory = path.join(source, relativePath)
    if (!(await existingType(directory))?.isDirectory()) throw new Error(`源目录已失效：${directory}`)
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) directories.push(path.join(relativePath, entry.name))
    }
  }
  return directories
}

async function resolveCopyDirectories(input: DirectoryMigrationCopyInput, stats: DirectoryMigrationStats) {
  const segments = input.relativePath ? input.relativePath.split(path.sep) : []
  if (path.isAbsolute(input.relativePath) || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('迁移子任务相对路径无效')
  }
  let source = input.sourcePath
  let target = input.targetPath
  if (!(await existingType(source))?.isDirectory() || !(await existingType(target))?.isDirectory()) {
    throw new Error('源目录或目标目录已失效')
  }
  for (const segment of segments) {
    source = path.join(source, segment)
    target = path.join(target, segment)
    if (!(await existingType(source))?.isDirectory()) throw new Error(`源目录已失效：${source}`)
    if (!await existingType(target)) {
      try {
        await fs.mkdir(target)
        stats.createdDirectories++
      } catch (error: any) {
        // 不同子任务可能需要创建同一层目录。
        if (error?.code !== 'EEXIST') throw error
      }
    }
    if (!(await existingType(target))?.isDirectory()) throw new Error(`目标位置存在同名文件或链接：${target}`)
  }
  return { source, target }
}

async function hasTargetFile(target: string) {
  const stat = await existingType(target)
  if (stat && !stat.isFile()) throw new Error(`目标位置存在同名目录、链接或特殊文件：${target}`)
  return !!stat
}

export async function copyMigrationDirectory(
  input: DirectoryMigrationCopyInput,
  isRetry = false,
  savePending?: SavePendingCopy
) {
  const stats = migrationStats()
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.runId)) {
    throw new Error('迁移任务标识无效')
  }
  const { source, target } = await resolveCopyDirectories(input, stats)
  const partialPrefix = `.smanga-${input.runId}-`

  // 清理旧版任务在崩溃时留下的同一批次临时文件。
  if (isRetry || input.recoverPartials) {
    for (const entry of await fs.readdir(target, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith(partialPrefix) &&
        /^[a-f0-9-]{36}\.partial$/i.test(entry.name.slice(partialPrefix.length))) {
        await unlinkPartial(path.join(target, entry.name))
      }
    }
  }

  if (input.pendingFile) {
    await recoverPendingCopy(source, target, input.pendingFile)
  }

  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory()) continue
    const sourceFile = path.join(source, entry.name)
    if (!entry.isFile()) throw new Error(`不支持迁移符号链接或特殊文件：${sourceFile}`)
    const targetFile = path.join(target, entry.name)
    if (await hasTargetFile(targetFile)) {
      stats.skippedFiles++
      continue
    }

    const before = await existingType(sourceFile)
    if (!before?.isFile()) throw new Error(`源文件已失效：${sourceFile}`)
    const pending = { name: entry.name }
    await savePending?.(pending)
    let handle: Awaited<ReturnType<typeof fs.open>>
    try {
      handle = await fs.open(targetFile, 'wx', before.mode & 0o777)
    } catch (error: any) {
      if (error?.code !== 'EEXIST' || !await hasTargetFile(targetFile)) throw error
      await savePending?.(null)
      stats.skippedFiles++
      continue
    }
    try {
      if (savePending) {
        const stat = await handle.stat({ bigint: true })
        await savePending({ ...pending, identity: { dev: String(stat.dev), ino: String(stat.ino) } })
      }
      await pipeline(createReadStream(sourceFile), handle.createWriteStream())
    } finally {
      await handle.close()
    }
    const copied = await existingType(targetFile)
    if (!fileUnchanged(before, await existingType(sourceFile)) || !copied?.isFile() || copied.size !== before.size) {
      throw new Error(`复制期间源文件有变化或目标文件大小不符：${sourceFile}`)
    }
    stats.copiedFiles++
  }
  return stats
}

async function recoverPendingCopy(source: string, target: string, pending: PendingCopyFile) {
  if (path.basename(pending.name) !== pending.name || ['.', '..', ''].includes(pending.name)) {
    throw new Error('目录复制进度中的文件名无效')
  }
  const targetFile = path.join(target, pending.name)
  const sourceFile = path.join(source, pending.name)
  if (!await hasTargetFile(targetFile) || await canRemoveSourceFile(sourceFile, targetFile)) return
  if (!(await existingType(sourceFile))?.isFile()) {
    throw new Error(`源文件不可用，已保留上次复制的目标文件：${targetFile}`)
  }

  // 只重建能确认为本任务打开的文件，保留其他进程创建的同名文件。
  const stat = await fs.lstat(targetFile, { bigint: true })
  if (stat.isFile() && stat.ino !== BigInt(0) &&
    String(stat.ino) === pending.identity?.ino && String(stat.dev) === pending.identity.dev) {
    await fs.unlink(targetFile)
    return
  }
  throw new Error(`上次复制中断，目标文件未通过验证且无法确认归属，已保留：${targetFile}`)
}

async function unlinkPartial(partial: string) {
  await fs.unlink(partial).catch((error) => {
    if (error?.code !== 'ENOENT') throw error
  })
}

async function deleteExtraneous(source: string, target: string, stats: DirectoryMigrationStats) {
  const targetEntries = await fs.readdir(target, { withFileTypes: true })
  for (const entry of targetEntries) {
    const sourceEntry = path.join(source, entry.name)
    const targetEntry = path.join(target, entry.name)
    const sourceStat = await existingType(sourceEntry)

    if (!sourceStat) {
      await fs.rm(targetEntry, { recursive: true, force: true })
      if (entry.isDirectory()) stats.deletedDirectories++
      else stats.deletedFiles++
      continue
    }

    if (entry.isDirectory() && sourceStat.isDirectory()) {
      await deleteExtraneous(sourceEntry, targetEntry, stats)
    }
  }
}

async function fileDigest(filePath: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

function fileUnchanged(before: Stats, after: Stats | null) {
  return after?.isFile() && before.dev === after.dev && before.ino === after.ino &&
    before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs
}

async function canRemoveSourceFile(source: string, target: string) {
  const [sourceStat, targetStat] = await Promise.all([existingType(source), existingType(target)])
  if (!sourceStat?.isFile() || !targetStat?.isFile() || sourceStat.size !== targetStat.size) return false
  // 同一个文件可能通过不同的挂载路径访问，不能把它当成独立副本。
  if (sourceStat.ino !== 0 && sourceStat.ino === targetStat.ino && sourceStat.dev === targetStat.dev) return false

  const [sourceDigest, targetDigest] = await Promise.all([fileDigest(source), fileDigest(target)])
  if (sourceDigest !== targetDigest) return false
  const [sourceAfter, targetAfter] = await Promise.all([existingType(source), existingType(target)])
  return fileUnchanged(sourceStat, sourceAfter) && fileUnchanged(targetStat, targetAfter)
}

async function removeVerifiedSourceFiles(source: string, target: string, stats: DirectoryMigrationStats) {
  // 只有真实目录才会被遍历，防止重试时跟随新出现的符号链接。
  if (!(await existingType(source))?.isDirectory() || !(await existingType(target))?.isDirectory()) {
    return source
  }

  let firstUnverified: string | undefined
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const sourceEntry = path.join(source, entry.name)
    const targetEntry = path.join(target, entry.name)
    if (entry.isDirectory()) {
      const unverified = await removeVerifiedSourceFiles(sourceEntry, targetEntry, stats)
      firstUnverified ??= unverified
    } else if (entry.isFile() && await canRemoveSourceFile(sourceEntry, targetEntry)) {
      await fs.unlink(sourceEntry)
      stats.deletedSourceFiles++
    } else {
      firstUnverified ??= sourceEntry
    }
  }
  return firstUnverified
}

export async function checkedMigrationRoots(input: DirectoryMigrationInput) {
  const check = await checkDirectoryMigrationPaths(input)
  const source = check.source.resolvedPath
  const target = check.target.resolvedPath
  if (!check.available || !source || !target) {
    throw new Error(check.message)
  }
  return { source, target }
}

function migrationStats(): DirectoryMigrationStats {
  return {
    copiedFiles: 0,
    skippedFiles: 0,
    createdDirectories: 0,
    deletedFiles: 0,
    deletedDirectories: 0,
    deletedSourceFiles: 0,
  }
}

export async function finishDirectoryMigration(
  input: DirectoryMigrationInput,
  checkpoint: SourceCleanupCheckpoint
) {
  const { source, target } = await checkedMigrationRoots(input)
  const stats = migrationStats()
  if (!checkpoint.started) {
    if (input.mirrorDelete === true) await deleteExtraneous(source, target, stats)
    if (input.deleteSource === true) await checkpoint.save()
  }
  if (input.deleteSource === true) {
    const unverified = await removeVerifiedSourceFiles(source, target, stats)
    if (unverified) throw new Error(`目标副本缺失、内容不同或无法确认，已保留未验证的源文件：${unverified}`)
  }
  return stats
}

