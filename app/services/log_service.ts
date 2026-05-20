import prisma from '#start/prisma'
import logger from '@adonisjs/core/services/logger'
import { get_config } from '#utils/index'
import type { HttpContext } from '@adonisjs/core/http'
import { LogLevel, type LogEvent, type LogLevelName } from '#type/log'
import { sanitizeLogValue } from './log_sanitizer.js'
import {
  serializeLogException,
  serializeLogJson,
  truncateLogMessage,
} from './log_serializer.js'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_MAX_CONTEXT_BYTES = 16000
const DEFAULT_MAX_EXCEPTION_BYTES = 32000
const DEFAULT_MESSAGE_BYTES = 1000

let cachedVersion = ''

function getAppVersion(): string {
  if (cachedVersion) {
    return cachedVersion
  }

  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    cachedVersion = String(packageJson.version || 'unknown')
  } catch {
    cachedVersion = 'unknown'
  }

  return cachedVersion
}

function getEnvironment(): string {
  return process.env.NODE_ENV || 'development'
}

function getLogConfig() {
  const config = get_config()?.logging || {}
  const dbConfig = config.db || {}
  return {
    enabled: config.enabled !== false,
    dbEnabled: dbConfig.enabled !== false,
    minLevel: String(dbConfig.minLevel || 'info').toLowerCase() as LogLevelName,
    maxContextBytes: Number(dbConfig.maxContextBytes || DEFAULT_MAX_CONTEXT_BYTES),
    maxExceptionBytes: Number(dbConfig.maxExceptionBytes || DEFAULT_MAX_EXCEPTION_BYTES),
  }
}

function getLevelValue(level: LogLevelName): number {
  return LogLevel[level] ?? LogLevel.info
}

function normalizeUnknownError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: (error as any).cause,
    }
  }

  if (typeof error === 'object' && error !== null) {
    return {
      message: (error as any).message || 'non-error object thrown',
      stack: (error as any).stack,
      remoteStatus: (error as any)?.response?.status,
      remoteMessage: (error as any)?.response?.data?.message,
      remoteData: (error as any)?.response?.data,
      raw: error,
    }
  }

  return {
    message: String(error),
  }
}

function shouldPersist(level: LogLevelName): boolean {
  const config = getLogConfig()
  if (!config.enabled || !config.dbEnabled) {
    return false
  }

  return getLevelValue(level) >= getLevelValue(config.minLevel)
}

function pickLoggerMethod(level: LogLevelName) {
  if (level === 'fatal') return 'fatal'
  if (level === 'error') return 'error'
  if (level === 'warn') return 'warn'
  if (level === 'debug') return 'debug'
  return 'info'
}

function buildLogRecord(event: LogEvent, level: LogLevelName) {
  const config = getLogConfig()

  const sanitizedContext = sanitizeLogValue({
    action: event.action,
    ...(event.context || {}),
  })

  const sanitizedDevice = sanitizeLogValue(event.device || {})
  const normalizedError = event.error ? normalizeUnknownError(event.error) : undefined
  const sanitizedException = normalizedError ? sanitizeLogValue(normalizedError) : undefined

  const message = truncateLogMessage(
    event.message || `${event.module}.${event.action}`,
    DEFAULT_MESSAGE_BYTES
  )

  return {
    logType: String(event.type || 'system'),
    logLevel: LogLevel[level],
    module: event.module,
    queue: event.queue || null,
    message,
    exception: serializeLogException(sanitizedException, config.maxExceptionBytes),
    version: getAppVersion(),
    environment: getEnvironment(),
    context: serializeLogJson(sanitizedContext, config.maxContextBytes),
    device: serializeLogJson(sanitizedDevice, config.maxContextBytes),
    userId: event.userId ?? null,
  }
}

async function safePersist(record: ReturnType<typeof buildLogRecord>) {
  try {
    await prisma.log.create({ data: record as any })
  } catch (error) {
    logger.error({ err: error }, '[log] persist failed')
  }
}

async function write(event: LogEvent, level: LogLevelName) {
  const record = buildLogRecord(event, level)
  const loggerMethod = pickLoggerMethod(level)

  logger[loggerMethod](
    {
      type: record.logType,
      module: record.module,
      action: event.action,
      queue: record.queue,
      userId: record.userId,
      context: record.context,
    },
    record.message
  )

  if (!shouldPersist(level)) {
    return
  }

  if (event.awaitPersist) {
    await safePersist(record)
    return
  }

  void safePersist(record)
}

function fromHttpContext(ctx: HttpContext) {
  return {
    userId: (ctx.request as any).userId ?? null,
    context: {
      requestId: ctx.request.id?.(),
      method: ctx.request.method(),
      url: ctx.request.url(),
      params: ctx.request.params(),
      query: ctx.request.qs(),
      statusCode: ctx.response.getStatus(),
    },
    device: {
      ip: ctx.request.ip(),
      userAgent: ctx.request.header('user-agent'),
      requestId: ctx.request.id?.(),
      method: ctx.request.method(),
      url: ctx.request.url(),
    },
  }
}

const log = {
  debug(event: Omit<LogEvent, 'level'>) {
    return write({ ...event, level: 'debug' }, 'debug')
  },
  info(event: Omit<LogEvent, 'level'>) {
    return write({ ...event, level: 'info' }, 'info')
  },
  warn(event: Omit<LogEvent, 'level'>) {
    return write({ ...event, level: 'warn' }, 'warn')
  },
  error(event: Omit<LogEvent, 'level'>) {
    return write({ ...event, level: 'error' }, 'error')
  },
  fatal(event: Omit<LogEvent, 'level'>) {
    return write({ ...event, level: 'fatal' }, 'fatal')
  },
  fromError(error: unknown) {
    return sanitizeLogValue(normalizeUnknownError(error))
  },
  fromHttpContext,
  safePersist,
}

export default log
export { log }