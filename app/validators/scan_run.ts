import vine from '@vinejs/vine'
import { paginationFields } from './shared.js'

export const listScanRunValidator = vine.compile(
  vine.object({
    ...paginationFields,
    mediaId: vine.number().positive().optional(),
    pathId: vine.number().positive().optional(),
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
    level: vine.string().trim().optional(),
    category: vine.string().trim().optional(),
  })
)
