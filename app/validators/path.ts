/**
 * 路径模块入参 validator
 */
import vine from '@vinejs/vine'
import { paginationFields, csvIdsField } from './shared.js'

export const listPathValidator = vine.compile(
  vine.object({
    ...paginationFields,
    mediaId: vine.number().positive().optional(),
  })
)

export const idParamPathValidator = vine.compile(
  vine.object({
    pathId: vine.number().positive(),
  })
)

export const createPathValidator = vine.compile(
  vine.object({
    pathContent: vine.string().trim().minLength(1),
    mediaId: vine.number().positive(),
    autoScan: vine.number().optional(),
    include: vine.string().optional(),
    exclude: vine.string().optional(),
  })
)

export const updatePathValidator = vine.compile(
  vine.object({
    autoScan: vine.number().optional(),
    include: vine.string().optional(),
    exclude: vine.string().optional(),
  })
)

export const batchIdsParamPathValidator = vine.compile(
  vine.object({
    pathIds: csvIdsField,
  })
)
