/**
 * Token 模块入参 validator
 */
import vine from '@vinejs/vine'

export const idParamTokenValidator = vine.compile(
  vine.object({
    tokenId: vine.number().positive(),
  })
)

// 原实现直接 passthrough Prisma.tokenCreateInput, 这里保持宽松, 仅要求 token 非空
export const createTokenValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(1),
  }).allowUnknownProperties()
)

export const updateTokenValidator = vine.compile(
  vine.object({
    tokenName: vine.string().trim().optional(),
    tokenStatus: vine.any().optional(),
    tokenType: vine.string().trim().optional(),
  })
)
