import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const FRONTEND_ROOT = process.env.FRONTEND_ROOT || '/app/smanga-website'

function isDirectory(path: string) {
  try {
    return existsSync(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}

function isFile(path: string) {
  try {
    return existsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

function isInsideRoot(root: string, target: string) {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function decodeUrlPath(path: string) {
  try {
    return decodeURIComponent(path)
  } catch {
    return null
  }
}

export function frontendRoot() {
  return FRONTEND_ROOT
}

export function frontendIndexPath() {
  return join(FRONTEND_ROOT, 'index.html')
}

export function frontendEnabled() {
  return isDirectory(FRONTEND_ROOT) && isFile(frontendIndexPath())
}

export function resolveFrontendFile(path: string) {
  if (!frontendEnabled()) return null

  const decoded = decodeUrlPath(path.split('?')[0] || '/')
  if (!decoded || decoded === '/') return null

  const target = resolve(FRONTEND_ROOT, `.${decoded}`)
  if (!isInsideRoot(FRONTEND_ROOT, target)) return null

  return isFile(target) ? target : null
}
