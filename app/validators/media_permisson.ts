import vine from '@vinejs/vine'

export const idParamMediaPermissonValidator = vine.compile(
  vine.object({
    mediaPermissonId: vine.number().positive(),
  })
)

export const createMediaPermissonValidator = vine.compile(
  vine
    .object({
      userId: vine.number().positive().optional(),
      mediaId: vine.number().positive().optional(),
    })
    .allowUnknownProperties()
)

export const updateMediaPermissonValidator = vine.compile(
  vine
    .object({
      userId: vine.number().positive().optional(),
      mediaId: vine.number().positive().optional(),
    })
    .allowUnknownProperties()
)
