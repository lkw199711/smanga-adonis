import vine from '@vinejs/vine'

export const idParamMetaValidator = vine.compile(
  vine.object({
    metaId: vine.number().positive(),
  })
)

export const createMetaValidator = vine.compile(
  vine
    .object({
      metaKey: vine.string().trim().optional(),
      metaValue: vine.any().optional(),
    })
    .allowUnknownProperties()
)

export const updateMetaValidator = vine.compile(
  vine.object({
    metaKey: vine.string().trim().optional(),
    metaValue: vine.any().optional(),
  })
)
