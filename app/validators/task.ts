import vine from '@vinejs/vine'
import { csvIdsField } from './shared.js'

export const idParamTaskValidator = vine.compile(
  vine.object({
    taskId: vine.number().withoutDecimals().positive(),
  })
)

export const batchIdsParamTaskValidator = vine.compile(
  vine.object({
    taskIds: csvIdsField,
  })
)
