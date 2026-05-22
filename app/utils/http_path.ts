export function pathnameFromUrl(url: string) {
  return url.split('?')[0] || '/'
}

export function isApiPath(url: string) {
  const path = pathnameFromUrl(url)
  return path === '/api' || path.startsWith('/api/')
}

export function normalizeApiPath(url: string) {
  const path = pathnameFromUrl(url)
  if (path === '/api') return '/'
  return path.startsWith('/api/') ? path.slice(4) : path
}
