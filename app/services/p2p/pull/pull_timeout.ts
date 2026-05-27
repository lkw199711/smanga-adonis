import { get_config } from '#utils/index'

const DEFAULT_TIMEOUTS = {
  root: 6 * 60 * 60 * 1000,
  media: 6 * 60 * 60 * 1000,
  manga: 3 * 60 * 60 * 1000,
  chapter: 30 * 60 * 1000,
  meta: 10 * 60 * 1000,
}

export type P2PTimeoutKind = keyof typeof DEFAULT_TIMEOUTS

export function getP2PPullTimeout(kind: P2PTimeoutKind) {
  const timeoutMs = get_config()?.p2p?.pull?.timeoutMs || {}
  const raw = Number(timeoutMs?.[kind])
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUTS[kind]
}
