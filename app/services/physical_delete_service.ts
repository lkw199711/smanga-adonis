import fs from 'node:fs'
import path from 'node:path'

type DeleteOptions = {
  allowRoot?: boolean
}

export function deleteFileRequested(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

export function resolvePhysicalDeleteTarget(
  targetPath: string,
  allowedRoot: string,
  options: DeleteOptions = {}
): string {
  if (!targetPath?.trim() || !allowedRoot?.trim()) {
    throw new Error('实体文件路径或媒体库根路径为空，拒绝删除')
  }

  const resolvedTarget = path.resolve(targetPath)
  const resolvedRoot = path.resolve(allowedRoot)
  // realpath 可阻止通过媒体库目录内的中间符号链接跳到目录外删除。
  const canonicalTarget = fs.existsSync(resolvedTarget)
    ? fs.realpathSync(resolvedTarget)
    : resolvedTarget
  const canonicalRoot = fs.existsSync(resolvedRoot) ? fs.realpathSync(resolvedRoot) : resolvedRoot
  const filesystemRoot = path.parse(canonicalTarget).root

  if (canonicalTarget === filesystemRoot) {
    throw new Error(`拒绝删除文件系统根目录: ${canonicalTarget}`)
  }

  const relative = path.relative(canonicalRoot, canonicalTarget)
  const isRoot = relative === ''
  const isOutsideRoot = relative === '..' || relative.startsWith(`..${path.sep}`)
  const isInsideRoot = !isOutsideRoot && !path.isAbsolute(relative)

  if (!isInsideRoot || (isRoot && !options.allowRoot)) {
    throw new Error(`实体文件路径不在允许删除的媒体库范围内: ${resolvedTarget}`)
  }

  return resolvedTarget
}

export function deletePhysicalTarget(
  targetPath: string,
  allowedRoot: string,
  options: DeleteOptions = {}
) {
  const target = resolvePhysicalDeleteTarget(targetPath, allowedRoot, options)
  fs.rmSync(target, { force: true, recursive: true })
}
