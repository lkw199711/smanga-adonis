/**
 * 标签模块入参 validator
 */
import vine from '@vinejs/vine'
import { paginationFields, csvIdsField } from './shared.js'

export const listTagValidator = vine.compile(
  vine.object({
    ...paginationFields,
  })
)

export const idParamTagValidator = vine.compile(
  vine.object({
    tagId: vine.number().positive(),
  })
)

export const createTagValidator = vine.compile(
  vine.object({
    tagName: vine.string().trim().minLength(1),
    description: vine.string().optional(),
    tagColor: vine.string().optional(),
  })
)

export const updateTagValidator = vine.compile(
  vine.object({
    tagName: vine.string().trim().minLength(1).optional(),
    description: vine.string().optional(),
    tagColor: vine.string().optional(),
  })
)

export const batchIdsParamTagValidator = vine.compile(
  vine.object({
    tagIds: csvIdsField,
  })
)

// manga-tag 查询: mangaId 路径参数
export const mangaIdParamValidator = vine.compile(
  vine.object({
    mangaId: vine.number().positive(),
  })
)

// tags_manga 查询: tagIds 可能是字符串(csv) 或数组
export const tagsMangaQueryValidator = vine.compile(
  vine.object({
    ...paginationFields,
    tagIds: vine.any(),
  })
)
