import vine from '@vinejs/vine'

export const fileQueryValidator = vine.compile(
  vine.object({
    file: vine.string().trim().minLength(1),
  })
)
