/**
 * 同步模块入参 validator
 */
import vine from '@vinejs/vine'
import { paginationFields, csvIdsField } from './shared.js'

export const listSyncValidator = vine.compile(
  vine.object({
    ...paginationFields,
  })
)

export const idParamSyncValidator = vine.compile(
  vine.object({
    syncId: vine.number().positive(),
  })
)

export const createSyncValidator = vine.compile(
  vine.object({
    syncType: vine.string().trim().minLength(1),
    syncName: vine.string().optional(),
    origin: vine.string().optional(),
    receivedPath: vine.string().trim().minLength(1),
    shareId: vine.any().optional(),
    link: vine.string().optional(),
    secret: vine.string().optional(),
    auto: vine.any().optional(),
    token: vine.string().optional(),
  })
)

export const updateSyncValidator = vine.compile(
  vine.object({
    syncType: vine.string().optional(),
    origin: vine.string().optional(),
    shareId: vine.any().optional(),
    link: vine.string().optional(),
    secret: vine.string().optional(),
    auto: vine.any().optional(),
    token: vine.string().optional(),
  })
)

export const batchIdsParamSyncValidator = vine.compile(
  vine.object({
    syncIds: csvIdsField,
  })
)
