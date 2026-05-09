/**
 * 版本模块入参 validator
 */
import vine from '@vinejs/vine'

export const idParamVersionValidator = vine.compile(
  vine.object({
    versionId: vine.number().positive(),
  })
)

// 原实现直接 passthrough Prisma.versionCreateInput, 这里保持宽松
export const createVersionValidator = vine.compile(
  vine.object({}).allowUnknownProperties()
)

export const updateVersionValidator = vine.compile(
  vine.object({
    versionName: vine.string().trim().optional(),
    versionStatus: vine.any().optional(),
    versionType: vine.string().trim().optional(),
    versionContent: vine.string().optional(),
  })
)
