/**
 * 路径模块入参 validator
 */
import vine from '@vinejs/vine'
import { paginationFields, csvIdsField } from './shared.js'
import { METADATA_PROFILE_KEYS, SCAN_TEMPLATE_KEYS } from '#services/scan/scan_types'

const scanTemplateKeyField = vine.enum([...SCAN_TEMPLATE_KEYS]).optional()
const metadataProfileKeyField = vine.enum([...METADATA_PROFILE_KEYS]).optional()

export const listPathValidator = vine.compile(
  vine.object({
    ...paginationFields,
    mediaId: vine.number().positive().optional(),
  })
)

export const idParamPathValidator = vine.compile(
  vine.object({
    pathId: vine.number().positive(),
  })
)

export const createPathValidator = vine.compile(
  vine.object({
    pathContent: vine.string().trim().minLength(1),
    mediaId: vine.number().positive(),
    autoScan: vine.number().optional(),
    include: vine.string().optional(),
    exclude: vine.string().optional(),
    scanTemplateKey: scanTemplateKeyField,
    scanTemplateConfig: vine.string().optional(),
    metadataProfileKey: metadataProfileKeyField,
    metadataProfileConfig: vine.string().optional(),
  })
)

export const previewPathValidator = vine.compile(
  vine.object({
    pathContent: vine.string().trim().minLength(1),
    mediaId: vine.number().positive().optional(),
    autoScan: vine.number().optional(),
    include: vine.string().optional(),
    exclude: vine.string().optional(),
    mediaType: vine.number().optional(),
    directoryFormat: vine.number().optional(),
    scanTemplateKey: scanTemplateKeyField,
    scanTemplateConfig: vine.string().optional(),
    metadataProfileKey: metadataProfileKeyField,
    metadataProfileConfig: vine.string().optional(),
    isCloudMedia: vine.number().optional(),
  })
)

export const updatePathValidator = vine.compile(
  vine.object({
    autoScan: vine.number().optional(),
    include: vine.string().optional(),
    exclude: vine.string().optional(),
    scanTemplateKey: scanTemplateKeyField,
    scanTemplateConfig: vine.string().optional(),
    metadataProfileKey: metadataProfileKeyField,
    metadataProfileConfig: vine.string().optional(),
  })
)

export const batchIdsParamPathValidator = vine.compile(
  vine.object({
    pathIds: csvIdsField,
  })
)
