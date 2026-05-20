export const LogLevel = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
} as const

export const LogType = {
  system: 'system',
  http: 'http',
  auth: 'auth',
  security: 'security',
  task: 'task',
  queue: 'queue',
  scan: 'scan',
  media: 'media',
  sync: 'sync',
  compress: 'compress',
  p2p: 'p2p',
  tracker: 'tracker',
  cron: 'cron',
  database: 'database',
} as const

export type LogLevelName = keyof typeof LogLevel
export type LogTypeName = keyof typeof LogType

export type LogValueRecord = Record<string, unknown>

export type LogEvent = {
  level?: LogLevelName
  type: LogTypeName | string
  module: string
  action: string
  message: string
  error?: unknown
  userId?: number | null
  queue?: string | null
  context?: LogValueRecord
  device?: LogValueRecord
  awaitPersist?: boolean
}