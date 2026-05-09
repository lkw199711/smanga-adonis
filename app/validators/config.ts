import vine from '@vinejs/vine'

export const setConfigValidator = vine.compile(
  vine
    .object({
      key: vine.string().trim().minLength(1),
      value: vine.any().optional(),
    })
    .allowUnknownProperties()
)

export const userConfigValidator = vine.compile(
  vine
    .object({
      userConfig: vine.any(),
    })
    .allowUnknownProperties()
)
