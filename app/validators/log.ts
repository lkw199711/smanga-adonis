/**
 * 日志模块入参 validator
 */
import vine from '@vinejs/vine'
import { paginationFields } from './shared.js'

export const listLogValidator = vine.compile(
  vine.object({
    ...paginationFields,
    logType: vine.string().trim().optional(),
    logLevel: vine.number().optional(),
    module: vine.string().trim().optional(),
    queue: vine.string().trim().optional(),
    userId: vine.number().positive().optional(),
    keyword: vine.string().trim().optional(),
    requestId: vine.string().trim().optional(),
    from: vine.string().trim().optional(),
    to: vine.string().trim().optional(),
  })
)

export const idParamLogValidator = vine.compile(
  vine.object({
    logId: vine.number().positive(),
  })
)

export const createLogValidator = vine.compile(
  vine.object({
    logType: vine.string().trim(),
    logLevel: vine.number(),
    module: vine.string().trim().optional(),
    queue: vine.string().trim().optional(),
    message: vine.string().trim(),
    exception: vine.string().trim().optional(),
    context: vine.any().optional(),
    device: vine.any().optional(),
    userId: vine.number().positive().optional(),
  })
)

export const updateLogValidator = vine.compile(
  vine.object({
    logType: vine.string().trim().optional(),
    logLevel: vine.number().optional(),
    module: vine.string().trim().optional(),
    queue: vine.string().trim().optional(),
    message: vine.string().trim().optional(),
    exception: vine.string().trim().optional(),
    context: vine.any().optional(),
    device: vine.any().optional(),
    userId: vine.number().positive().optional(),
  })
)

export const summaryLogValidator = vine.compile(
  vine.object({
    hours: vine.number().positive().optional(),
  })
)

export const cleanupLogValidator = vine.compile(
  vine.object({
    before: vine.string().trim().optional(),
  })
)
