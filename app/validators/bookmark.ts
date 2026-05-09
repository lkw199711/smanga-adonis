/**
 * 书签模块入参 validator
 *
 * 覆盖路由:
 *   GET    /bookmark                      -> listBookmarkValidator (query)
 *   GET    /bookmark/:bookmarkId          -> idParamBookmarkValidator (params)
 *   POST   /bookmark                      -> createBookmarkValidator (body)
 *   PUT    /bookmark/:bookmarkId          -> updateBookmarkValidator (body) + idParamBookmarkValidator (params)
 *   DELETE /bookmark/:bookmarkId          -> idParamBookmarkValidator (params)
 *   DELETE /bookmark/:bookmarkIds/batch   -> batchIdsParamBookmarkValidator (params)
 */
import vine from '@vinejs/vine'
import { paginationFields, csvIdsField } from './shared.js'

// 列表查询
export const listBookmarkValidator = vine.compile(
  vine.object({
    ...paginationFields,
    chapterId: vine.number().positive().optional(),
  })
)

// 单条 id 路径参数
export const idParamBookmarkValidator = vine.compile(
  vine.object({
    bookmarkId: vine.number().positive(),
  })
)

// 创建书签
export const createBookmarkValidator = vine.compile(
  vine.object({
    chapterId: vine.number().positive(),
    mangaId: vine.number().positive(),
    mediaId: vine.number().positive(),
    page: vine.number().min(0),
    browseType: vine.string().trim().optional(),
    pageImage: vine.string().optional(),
  })
)

// 更新书签: 仅允许 page / browseType
export const updateBookmarkValidator = vine.compile(
  vine.object({
    page: vine.number().min(0).optional(),
    browseType: vine.string().trim().optional(),
  })
)

// 批量删除: 路径上的 :bookmarkIds 是 CSV 字符串,transform 为 number[]
export const batchIdsParamBookmarkValidator = vine.compile(
  vine.object({
    bookmarkIds: csvIdsField,
  })
)

