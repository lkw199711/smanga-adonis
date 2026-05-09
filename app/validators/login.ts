/**
 * 登录模块入参 validator
 *
 * 覆盖路由:
 *   GET    /login                 -> 无参数
 *   GET    /login/:loginId        -> idParamLoginValidator (params)
 *   POST   /login                 -> createLoginValidator (body, 用户登录主入口)
 *   PUT    /login/:loginId        -> idParamLoginValidator + updateLoginValidator
 *   DELETE /login/:loginId        -> idParamLoginValidator
 */
import vine from '@vinejs/vine'

export const idParamLoginValidator = vine.compile(
  vine.object({
    loginId: vine.number().positive(),
  })
)

// 登录: userName + passWord 必填
export const createLoginValidator = vine.compile(
  vine.object({
    userName: vine.string().trim().minLength(1),
    passWord: vine.string().minLength(1),
  })
)

// 更新登录记录 (仅保留原实现的 userName / passWord)
export const updateLoginValidator = vine.compile(
  vine.object({
    userName: vine.string().trim().optional(),
    passWord: vine.string().optional(),
  })
)
