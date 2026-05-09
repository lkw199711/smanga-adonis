/**
 * 最后阅读记录模块入参 validator
 */
import vine from '@vinejs/vine'
import { paginationFields } from './shared.js'

export const listLatestValidator = vine.compile(
  vine.object({
    ...paginationFields,
  })
)

export const mangaIdParamValidator = vine.compile(
  vine.object({
    mangaId: vine.number().positive(),
  })
)

export const chapterIdParamValidator = vine.compile(
  vine.object({
    chapterId: vine.number().positive(),
  })
)

export const createLatestValidator = vine.compile(
  vine.object({
    chapterId: vine.number().positive(),
    mangaId: vine.number().positive(),
    page: vine.number().min(0),
    count: vine.number().min(0).optional(),
    finish: vine.number().min(0).optional(),
  })
)

export const updateLatestValidator = vine.compile(
  vine.object({
    chapterId: vine.number().positive().optional(),
    page: vine.number().min(0).optional(),
    finish: vine.number().min(0).optional(),
  })
)
