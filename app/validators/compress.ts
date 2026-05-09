/**
 * 压缩模块入参 validator
 */
import vine from '@vinejs/vine'
import { paginationFields, csvIdsField } from './shared.js'

export const listCompressValidator = vine.compile(
  vine.object({
    ...paginationFields,
  })
)

export const idParamCompressValidator = vine.compile(
  vine.object({
    compressId: vine.number().positive(),
  })
)

// 压缩记录入参较宽松,字段均可选,由业务决定
const compressBody = {
  compressType: vine.string().optional(),
  compressPath: vine.string().optional(),
  compressStatus: vine.string().optional(),
  imageCount: vine.number().optional(),
  mediaId: vine.number().optional(),
  mangaId: vine.number().optional(),
  chapterId: vine.number().optional(),
  chapterPath: vine.string().optional(),
}

export const createCompressValidator = vine.compile(vine.object(compressBody))
export const updateCompressValidator = vine.compile(vine.object(compressBody))

export const batchIdsParamCompressValidator = vine.compile(
  vine.object({
    compressIds: csvIdsField,
  })
)
