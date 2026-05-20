import { get_config } from '#utils/index'

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ serializeError: 'failed_to_stringify' })
  }
}

function truncateByBytes(value: string, maxBytes: number): string {
  const byteLength = Buffer.byteLength(value, 'utf8')
  if (byteLength <= maxBytes) {
    return value
  }

  const buffer = Buffer.from(value, 'utf8')
  const truncated = buffer.subarray(0, maxBytes).toString('utf8')
  return `${truncated}[truncated:${byteLength - maxBytes}bytes]`
}

export function getSqlClient(): string {
  const sqlClient = get_config()?.sql?.client
  return String(sqlClient || 'sqlite').toLowerCase()
}

export function isSqliteClient(): boolean {
  return getSqlClient() === 'sqlite'
}

function applyObjectLimit(value: unknown, maxBytes: number): unknown {
  const raw = safeJsonStringify(value)
  if (Buffer.byteLength(raw, 'utf8') <= maxBytes) {
    return value
  }

  return {
    truncated: true,
    preview: truncateByBytes(raw, maxBytes),
  }
}

export function serializeLogJson(value: unknown, maxBytes: number): unknown {
  if (value === undefined) {
    return undefined
  }

  if (isSqliteClient()) {
    return truncateByBytes(safeJsonStringify(value), maxBytes)
  }

  return applyObjectLimit(value, maxBytes)
}

export function serializeLogException(value: unknown, maxBytes: number): string | null {
  if (value === undefined || value === null) {
    return null
  }

  return truncateByBytes(safeJsonStringify(value), maxBytes)
}

export function truncateLogMessage(message: string, maxBytes = 1000): string {
  return truncateByBytes(message, maxBytes)
}