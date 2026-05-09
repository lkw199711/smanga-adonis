/**
 * 日志模块入参 validator
 */
import vine from '@vinejs/vine'
import { paginationFields } from './shared.js'

export const listLogValidator = vine.compile(
  vine.object({
    ...paginationFields,
  })
)

export const idParamLogValidator = vine.compile(
  vine.object({
    logId: vine.number().positive(),
  })
)

// log 模型字段较自由,只要求 logContent 必填用于 create/update
export const createLogValidator = vine.compile(
  vine.object({
    logContent: vine.string(),
    logType: vine.string().optional(),
    logLevel: vine.string().optional(),
    logTitle: vine.string().optional(),
  })
)

export const updateLogValidator = vine.compile(
  vine.object({
    logContent: vine.string(),
  })
)
