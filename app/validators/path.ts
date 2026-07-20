/**
 * 路径模块入参 validator
 */
import vine from '@vinejs/vine'
import { paginationFields, csvIdsField } from './shared.js'
import { METADATA_PROFILE_KEYS, SCAN_TEMPLATE_KEYS } from '#services/scan/scan_types'
import {
  parseMetadataProfileConfig,
  parseScanTemplateConfig,
  ScanConfigError,
} from '#services/scan/scan_config_service'

const scanTemplateKeyField = vine.enum([...SCAN_TEMPLATE_KEYS]).optional()
const metadataProfileKeyField = vine.enum([...METADATA_PROFILE_KEYS]).optional()
const scanTemplateConfigRule = vine.createRule((value, _, field) => {
  if (typeof value !== 'string') return
  try {
    parseScanTemplateConfig(value)
  } catch (error) {
    const message = error instanceof ScanConfigError ? error.message : '扫描模板配置无效'
    field.report(message, 'scanTemplateConfig', field)
  }
})
const metadataProfileConfigRule = vine.createRule((value, _, field) => {
  if (typeof value !== 'string') return
  try {
    parseMetadataProfileConfig(value)
  } catch (error) {
    const message = error instanceof ScanConfigError ? error.message : '元数据配置无效'
    field.report(message, 'metadataProfileConfig', field)
  }
})

const scanTemplateConfigField = vine
  .string()
  .trim()
  .maxLength(64 * 1024)
  .use(scanTemplateConfigRule())
  .optional()
const metadataProfileConfigField = vine
  .string()
  .trim()
  .maxLength(64 * 1024)
  .use(metadataProfileConfigRule())
  .optional()

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
    scanTemplateConfig: scanTemplateConfigField,
    metadataProfileKey: metadataProfileKeyField,
    metadataProfileConfig: metadataProfileConfigField,
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
    scanTemplateConfig: scanTemplateConfigField,
    metadataProfileKey: metadataProfileKeyField,
    metadataProfileConfig: metadataProfileConfigField,
    isCloudMedia: vine.number().optional(),
  })
)

export const updatePathValidator = vine.compile(
  vine.object({
    autoScan: vine.number().optional(),
    include: vine.string().optional(),
    exclude: vine.string().optional(),
    scanTemplateKey: scanTemplateKeyField,
    scanTemplateConfig: scanTemplateConfigField,
    metadataProfileKey: metadataProfileKeyField,
    metadataProfileConfig: metadataProfileConfigField,
  })
)

export const batchIdsParamPathValidator = vine.compile(
  vine.object({
    pathIds: csvIdsField,
  })
)
