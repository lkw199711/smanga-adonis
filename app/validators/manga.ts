/**
 * 漫画模块入参 validator
 *
 * 覆盖路由:
 *   GET    /manga                         -> listMangaValidator (query)
 *   GET    /manga/:mangaId                -> idParamMangaValidator (params)
 *   POST   /manga                         -> createMangaValidator (body, passthrough)
 *   PUT    /manga/:mangaId                -> idParamMangaValidator + updateMangaValidator
 *   DELETE /manga/:mangaId                -> idParamMangaValidator
 *   POST   /manga/destroy-batch           -> batchIdsMangaValidator (body)
 *   GET    /manga/:mangaId/scan           -> idParamMangaValidator
 *   POST   /manga/:mangaId/edit-meta      -> idParamMangaValidator + editMetaMangaValidator
 *   POST   /manga/:mangaId/reload-meta    -> idParamMangaValidator
 *   POST   /manga/:mangaId/tags           -> idParamMangaValidator + addTagsMangaValidator
 *   POST   /manga/:mangaId/compress-all   -> idParamMangaValidator
 *   DELETE /manga/:mangaId/compress       -> idParamMangaValidator
 */
import vine from '@vinejs/vine'
import { paginationFields } from './shared.js'

// 列表查询
export const listMangaValidator = vine.compile(
  vine.object({
    ...paginationFields,
    mediaId: vine.number().positive().optional(),
    chapterId: vine.number().positive().optional(),
    keyWord: vine.string().trim().optional(),
  })
)

// 单条 id 路径参数
export const idParamMangaValidator = vine.compile(
  vine.object({
    mangaId: vine.number().positive(),
  })
)

// 新增漫画 (原实现直接 passthrough 到 Prisma, 保持宽松)
export const createMangaValidator = vine.compile(
  vine.object({
    mangaName: vine.string().trim().minLength(1),
    mediaId: vine.number().positive(),
  }).allowUnknownProperties()
)

// 更新漫画
export const updateMangaValidator = vine.compile(
  vine.object({
    mangaName: vine.string().trim().optional(),
    mangaNumber: vine.string().trim().optional(),
    mangaPath: vine.string().trim().optional(),
    mangaCover: vine.string().optional(),
    removeFirst: vine.number().optional(),
    browseType: vine.string().trim().optional(),
  })
)

// 批量删除 (POST body 形式)
export const batchIdsMangaValidator = vine.compile(
  vine.object({
    mangaIds: vine.array(vine.number().positive()).minLength(1),
  })
)

// 编辑元数据
export const editMetaMangaValidator = vine.compile(
  vine.object({
    title: vine.string().trim().optional(),
    author: vine.string().trim().optional(),
    publishDate: vine.string().trim().optional(),
    mangaCover: vine.string().optional(),
    star: vine.any().optional(),
    describe: vine.string().optional(),
    tags: vine.any().optional(),
    wirteMetaJson: vine.any().optional(),
  })
)

// 添加标签
export const addTagsMangaValidator = vine.compile(
  vine.object({
    tags: vine.array(vine.any()),
    metaWriteJson: vine.any().optional(),
  })
)
