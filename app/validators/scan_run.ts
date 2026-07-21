import vine from '@vinejs/vine'
import { paginationFields } from './shared.js'

export const listScanRunValidator = vine.compile(
  vine.object({
    ...paginationFields,
    pageSize: vine.number().positive().max(200).optional(),
    mediaId: vine.number().positive().optional(),
    pathId: vine.number().positive().optional(),
    status: vine.enum(['pending', 'running', 'success', 'failed']).optional(),
  })
)

export const idParamScanRunValidator = vine.compile(
  vine.object({
    scanRunId: vine.number().positive(),
  })
)

export const listScanRunItemValidator = vine.compile(
  vine.object({
    ...paginationFields,
    pageSize: vine.number().positive().max(500).optional(),
    level: vine.string().trim().optional(),
    category: vine.string().trim().optional(),
  })
)
