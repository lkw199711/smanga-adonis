/**
 * 用户模块入参 validator
 *
 * 覆盖路由:
 *   GET    /user                   -> listUserValidator (query)
 *   GET    /user/:userId           -> idParamUserValidator (params)
 *   POST   /user                   -> createUserValidator (body)
 *   PUT    /user/:userId           -> idParamUserValidator + updateUserValidator
 *   DELETE /user/:userId           -> idParamUserValidator
 *   GET    /user/config            -> 无参数 (由 auth middleware 取 userId)
 */
import vine from '@vinejs/vine'
import { paginationFields } from './shared.js'

export const listUserValidator = vine.compile(
  vine.object({
    ...paginationFields,
  })
)

export const idParamUserValidator = vine.compile(
  vine.object({
    userId: vine.number().positive(),
  })
)

// mediaLimit 为数组: [{ mediaId, permit }, ...]
const mediaLimitItem = vine.object({
  mediaId: vine.number().positive(),
  permit: vine.any().optional(),
})

export const createUserValidator = vine.compile(
  vine.object({
    userName: vine.string().trim().minLength(1),
    passWord: vine.string().minLength(1),
    role: vine.string().trim().optional(),
    mediaPermit: vine.string().trim().optional(),
    mediaLimit: vine.array(mediaLimitItem).optional(),
  })
)

export const updateUserValidator = vine.compile(
  vine.object({
    userName: vine.string().trim().optional(),
    passWord: vine.string().optional(),
    userConfig: vine.any().optional(),
    role: vine.string().trim().optional(),
    mediaPermit: vine.string().trim().optional(),
    mediaLimit: vine.array(mediaLimitItem).optional(),
  })
)
