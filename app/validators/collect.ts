/**
 * 收藏模块入参 validator
 *
 * 覆盖路由:
 *   GET    /collect                          -> 无参数
 *   GET    /collect/manga                    -> listCollectValidator (query)
 *   GET    /collect/chapter                  -> listCollectValidator (query)
 *   POST   /collect                          -> createCollectValidator (body)
 *   GET    /collect/:collectId               -> idParamCollectValidator (params)
 *   PUT    /collect/:collectId               -> idParamCollectValidator + updateCollectValidator
 *   DELETE /collect/:collectId               -> idParamCollectValidator (params)
 *   POST   /collect/manga/:mangaId           -> mangaParamCollectValidator + collectMangaBodyValidator
 *   POST   /collect/chapter/:chapterId       -> chapterParamCollectValidator + collectChapterBodyValidator
 *   GET    /collect/is/manga/:mangaId        -> isCollectMangaParamValidator
 *   GET    /collect/is/chapter/:chapterId    -> isCollectChapterParamValidator
 */
import vine from '@vinejs/vine'
import { paginationFields } from './shared.js'

// 列表 / 分页 (mangas / chapters)
export const listCollectValidator = vine.compile(
  vine.object({
    ...paginationFields,
  })
)

// 单条 id 路径参数
export const idParamCollectValidator = vine.compile(
  vine.object({
    collectId: vine.number().positive(),
  })
)

// 收藏/取消收藏 漫画 - 路径参数
export const mangaParamCollectValidator = vine.compile(
  vine.object({
    mangaId: vine.number().positive(),
  })
)

// 收藏/取消收藏 漫画 - body (mediaId/mangaName 可选,保持原行为)
export const collectMangaBodyValidator = vine.compile(
  vine.object({
    mangaName: vine.string().trim().optional(),
    mediaId: vine.number().positive().optional(),
  })
)

// 收藏/取消收藏 章节 - 路径参数
export const chapterParamCollectValidator = vine.compile(
  vine.object({
    chapterId: vine.number().positive(),
  })
)

// 收藏/取消收藏 章节 - body
export const collectChapterBodyValidator = vine.compile(
  vine.object({
    chapterName: vine.string().trim().optional(),
    mediaId: vine.number().positive().optional(),
    mangaId: vine.number().positive().optional(),
    mangaName: vine.string().trim().optional(),
  })
)

// 直接新增
export const createCollectValidator = vine.compile(
  vine.object({
    collectType: vine.string().trim(),
    userId: vine.number().positive(),
    mediaId: vine.number().positive().optional(),
    mangaId: vine.number().positive().optional(),
    mangaName: vine.string().trim().optional(),
    chapterId: vine.number().positive().optional(),
    chapterName: vine.string().trim().optional(),
  })
)

// 更新
export const updateCollectValidator = vine.compile(
  vine.object({
    collectType: vine.string().trim().optional(),
    userId: vine.number().positive().optional(),
    mediaId: vine.number().positive().optional(),
    mangaId: vine.number().positive().optional(),
    mangaName: vine.string().trim().optional(),
    chapterId: vine.number().positive().optional(),
    chapterName: vine.string().trim().optional(),
  })
)

// 是否收藏 - 漫画
export const isCollectMangaParamValidator = vine.compile(
  vine.object({
    mangaId: vine.number().positive(),
  })
)

// 是否收藏 - 章节
export const isCollectChapterParamValidator = vine.compile(
  vine.object({
    chapterId: vine.number().positive(),
  })
)
