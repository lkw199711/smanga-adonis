const DEFAULT_REDACT_KEYS = [
  'password',
  'passWord',
  'token',
  'authorization',
  'cookie',
  'secret',
  'nodeToken',
  'APP_KEY',
  'DB_PASSWORD',
]

const REDACTED_TEXT = '[REDACTED]'

export type SanitizeLogOptions = {
  maxDepth: number
  maxStringLength: number
  redactKeys: string[]
}

const DEFAULT_OPTIONS: SanitizeLogOptions = {
  maxDepth: 8,
  maxStringLength: 4096,
  redactKeys: DEFAULT_REDACT_KEYS,
}

function truncateString(value: string, maxStringLength: number): string {
  if (value.length <= maxStringLength) {
    return value
  }

  return `${value.slice(0, maxStringLength)}...[truncated:${value.length - maxStringLength}]`
}

function normalizeErrorLike(value: Error): Record<string, unknown> {
  return {
    name: value.name,
    message: value.message,
    stack: value.stack,
    cause: (value as any).cause,
  }
}

function sanitizeInternal(
  value: unknown,
  options: SanitizeLogOptions,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    return truncateString(value, options.maxStringLength)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'function') {
    return `[Function:${value.name || 'anonymous'}]`
  }

  if (depth >= options.maxDepth) {
    return '[MaxDepth]'
  }

  if (value instanceof Error) {
    return sanitizeInternal(normalizeErrorLike(value), options, depth + 1, seen)
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeInternal(item, options, depth + 1, seen))
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]'
    }

    seen.add(value as object)

    const redactKeySet = new Set(options.redactKeys.map((key) => key.toLowerCase()))
    const output: Record<string, unknown> = {}

    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (redactKeySet.has(key.toLowerCase())) {
        output[key] = REDACTED_TEXT
        continue
      }
      output[key] = sanitizeInternal(val, options, depth + 1, seen)
    }

    return output
  }

  return String(value)
}

export function sanitizeLogValue(
  value: unknown,
  overrideOptions: Partial<SanitizeLogOptions> = {}
): unknown {
  const options = {
    ...DEFAULT_OPTIONS,
    ...overrideOptions,
  }

  return sanitizeInternal(value, options, 0, new WeakSet<object>())
}

export function getRedactedText() {
  return REDACTED_TEXT
}