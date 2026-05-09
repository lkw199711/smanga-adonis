/**
 * 媒体库模块入参 validator
 *
 * 覆盖路由:
 *   GET    /media                   -> listMediaValidator (query)
 *   GET    /media/:mediaId          -> idParamMediaValidator (params)
 *   POST   /media                   -> createMediaValidator (body)
 *   PUT    /media/:mediaId          -> idParamMediaValidator + updateMediaValidator
 *   DELETE /media/:mediaId          -> idParamMediaValidator
 *   POST   /media/destroy-batch     -> batchIdsMediaValidator (body)
 *   GET    /media/:mediaId/poster   -> idParamMediaValidator
 *   GET    /media/:mediaId/scan     -> idParamMediaValidator
 */
import vine from '@vinejs/vine'
import { paginationFields } from './shared.js'

// 列表查询
export const listMediaValidator = vine.compile(
  vine.object({
    ...paginationFields,
  })
)

// 单条 id 路径参数
export const idParamMediaValidator = vine.compile(
  vine.object({
    mediaId: vine.number().positive(),
  })
)

// 新增媒体库
export const createMediaValidator = vine.compile(
  vine.object({
    mediaName: vine.string().trim().minLength(1),
    mediaType: vine.number().optional(),
    browseType: vine.string().trim().optional(),
    direction: vine.number().optional(),
    directoryFormat: vine.number().optional(),
    removeFirst: vine.number().optional(),
    sourceWebsite: vine.string().trim().optional(),
    isCloudMedia: vine.number().optional(),
  })
)

// 更新媒体库
export const updateMediaValidator = vine.compile(
  vine.object({
    mediaName: vine.string().trim().minLength(1).optional(),
    mediaType: vine.number().optional(),
    browseType: vine.string().trim().optional(),
    direction: vine.number().optional(),
    directoryFormat: vine.number().optional(),
    mediaCover: vine.string().optional(),
    removeFirst: vine.number().optional(),
    sourceWebsite: vine.string().trim().optional(),
    isCloudMedia: vine.number().optional(),
  })
)

// 批量删除 (POST body 形式, 前端传数字数组)
export const batchIdsMediaValidator = vine.compile(
  vine.object({
    mediaIds: vine.array(vine.number().positive()).minLength(1),
  })
)
