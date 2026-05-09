/**
 * 章节模块入参 validator
 *
 * 覆盖路由:
 *   GET    /chapter                       -> listChapterValidator (query)
 *   GET    /chapter/:chapterId            -> idParamChapterValidator (params)
 *   GET    /chapter/first                 -> firstChapterValidator (query)
 *   GET    /chapter/:chapterId/images     -> idParamChapterValidator + imagesChapterValidator (body)
 *   POST   /chapter                       -> createChapterValidator (body, passthrough)
 *   PUT    /chapter/:chapterId            -> idParamChapterValidator + updateChapterValidator
 *   DELETE /chapter/:chapterId            -> idParamChapterValidator
 *   DELETE /chapter/:chapterIds/batch     -> batchIdsParamChapterValidator (params)
 *   POST   /chapter/download              -> downloadChapterValidator (body)
 *   DELETE /chapter/:chapterId/compress   -> idParamChapterValidator
 */
import vine from '@vinejs/vine'
import { paginationFields, csvIdsField } from './shared.js'

// 列表查询
export const listChapterValidator = vine.compile(
  vine.object({
    ...paginationFields,
    mangaId: vine.number().positive().optional(),
    mediaId: vine.number().positive().optional(),
    keyWord: vine.string().trim().optional(),
  })
)

// 单条 id 路径参数
export const idParamChapterValidator = vine.compile(
  vine.object({
    chapterId: vine.number().positive(),
  })
)

// 首章查询 (query)
export const firstChapterValidator = vine.compile(
  vine.object({
    mangaId: vine.number().positive(),
    order: vine.string().trim().optional(),
  })
)

// 获取章节图片 (body: orderChapterByNumber, reTry)
export const imagesChapterValidator = vine.compile(
  vine.object({
    orderChapterByNumber: vine.any().optional(),
    reTry: vine.number().optional(),
  })
)

// 新增章节 (passthrough 到 Prisma)
export const createChapterValidator = vine.compile(
  vine.object({
    chapterName: vine.string().trim().minLength(1),
    mangaId: vine.number().positive(),
  }).allowUnknownProperties()
)

// 更新章节
export const updateChapterValidator = vine.compile(
  vine.object({
    chapterName: vine.string().trim().optional(),
    chapterPath: vine.string().trim().optional(),
    chapterCover: vine.string().optional(),
    chapterNumber: vine.string().trim().optional(),
  })
)

// 批量删除 (路径参数 CSV)
export const batchIdsParamChapterValidator = vine.compile(
  vine.object({
    chapterIds: csvIdsField,
  })
)

// 下载章节
export const downloadChapterValidator = vine.compile(
  vine.object({
    chapterId: vine.number().positive(),
  })
)
