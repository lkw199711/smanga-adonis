/**
 * 分享模块入参 validator
 *
 * 覆盖路由:
 *   GET    /share                     -> listShareValidator (query)
 *   GET    /share/:shareId            -> idParamShareValidator (params)
 *   POST   /share                     -> createShareValidator (body)
 *   PUT    /share/:shareId            -> idParamShareValidator + updateShareValidator
 *   DELETE /share/:shareId            -> idParamShareValidator
 *   DELETE /share/:shareIds/batch     -> batchIdsParamShareValidator (params, 字符串 CSV)
 *   POST   /share/analysis            -> analysisShareValidator (body)
 *   POST   /share/analysis/chapters   -> analysisChaptersShareValidator (body)
 *   POST   /share/analysis/images     -> analysisImagesShareValidator (body)
 *   POST   /share/analysis/mangas     -> analysisMangasShareValidator (body)
 *
 * 注: shareId 为字符串 (uuid/主键透传), 不做 number 强转
 */
import vine from '@vinejs/vine'
import { paginationFields, csvIdsField } from './shared.js'

// 列表查询
export const listShareValidator = vine.compile(
  vine.object({
    ...paginationFields,
  })
)

// 单条 shareId 路径参数 (Prisma 中为自增 Int)
export const idParamShareValidator = vine.compile(
  vine.object({
    shareId: vine.number().positive(),
  })
)

// 新建分享
export const createShareValidator = vine.compile(
  vine.object({
    mediaId: vine.number().positive(),
    mangaId: vine.number().positive().optional(),
    expires: vine.number().optional(),
    origin: vine.string().trim().minLength(1),
    shareName: vine.string().trim().optional(),
  })
)

// 更新分享
export const updateShareValidator = vine.compile(
  vine.object({
    mediaId: vine.number().positive().optional(),
    mangaId: vine.number().positive().optional(),
  })
)

// 批量删除 (CSV 字符串 -> number[])
export const batchIdsParamShareValidator = vine.compile(
  vine.object({
    shareIds: csvIdsField,
  })
)

// 分享解析 (主入口)
export const analysisShareValidator = vine.compile(
  vine.object({
    secret: vine.string().trim().minLength(1),
    mangaId: vine.number().positive().optional(),
    chapterId: vine.number().positive().optional(),
  })
)

// 分享解析: 章节列表
export const analysisChaptersShareValidator = vine.compile(
  vine.object({
    mangaId: vine.number().positive(),
    secret: vine.string().trim().optional(),
    chapterId: vine.number().positive().optional(),
  })
)

// 分享解析: 章节图片
export const analysisImagesShareValidator = vine.compile(
  vine.object({
    chapterId: vine.number().positive(),
  })
)

// 分享解析: 漫画列表
export const analysisMangasShareValidator = vine.compile(
  vine.object({
    mediaId: vine.number().positive(),
  })
)
