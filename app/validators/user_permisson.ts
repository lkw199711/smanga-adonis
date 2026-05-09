import vine from '@vinejs/vine'

export const idParamUserPermissonValidator = vine.compile(
  vine.object({
    userPermissonId: vine.number().positive(),
  })
)

export const createUserPermissonValidator = vine.compile(
  vine
    .object({
      userId: vine.number().positive().optional(),
      permissonId: vine.number().positive().optional(),
    })
    .allowUnknownProperties()
)

export const updateUserPermissonValidator = vine.compile(
  vine
    .object({
      userId: vine.number().positive().optional(),
      permissonId: vine.number().positive().optional(),
    })
    .allowUnknownProperties()
)
