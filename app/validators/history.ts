/**
 * 历史记录模块入参 validator
 *
 * 覆盖路由:
 *   GET    /history                             -> listHistoryValidator (query)
 *   POST   /history                             -> createHistoryValidator (body)
 *   GET    /history/:historyId                  -> idParamHistoryValidator (params)
 *   PUT    /history/chapter/:chapterId          -> chapterParamHistoryValidator + updateHistoryValidator
 *   DELETE /history/chapter/:chapterId          -> chapterParamHistoryValidator
 *   GET/POST /history/chapter/:chapterId/read   -> chapterParamHistoryValidator
 *   POST   /history/manga/:mangaId/read-all     -> mangaParamHistoryValidator
 *   POST   /history/manga/:mangaId/unread-all   -> mangaParamHistoryValidator
 */
import vine from '@vinejs/vine'
import { paginationFields } from './shared.js'

// 列表查询 (分页必填, 原控制器 raw SQL 直接 LIMIT/OFFSET)
export const listHistoryValidator = vine.compile(
  vine.object({
    ...paginationFields,
    page: vine.number().positive(),
    pageSize: vine.number().positive(),
  })
)

// historyId 路径参数
export const idParamHistoryValidator = vine.compile(
  vine.object({
    historyId: vine.number().positive(),
  })
)

// chapterId 路径参数
export const chapterParamHistoryValidator = vine.compile(
  vine.object({
    chapterId: vine.number().positive(),
  })
)

// mangaId 路径参数
export const mangaParamHistoryValidator = vine.compile(
  vine.object({
    mangaId: vine.number().positive(),
  })
)

// 新建历史
export const createHistoryValidator = vine.compile(
  vine.object({
    mediaId: vine.number().positive(),
    mangaId: vine.number().positive(),
    chapterId: vine.number().positive(),
    chapterName: vine.string().trim().optional(),
    mangaName: vine.string().trim().optional(),
  })
)

// 更新历史
export const updateHistoryValidator = vine.compile(
  vine.object({
    mediaId: vine.number().positive().optional(),
    mangaId: vine.number().positive().optional(),
    chapterId: vine.number().positive().optional(),
    chapterName: vine.string().trim().optional(),
    mangaName: vine.string().trim().optional(),
  })
)
