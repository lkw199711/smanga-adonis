import vine from '@vinejs/vine'

export const imageFileBodyValidator = vine.compile(
  vine.object({
    file: vine.string().trim().minLength(1),
  })
)

export const uploadImageBodyValidator = vine.compile(
  vine
    .object({
      mangaId: vine.number().positive().optional(),
      chapterId: vine.number().positive().optional(),
      mediaId: vine.number().positive().optional(),
    })
    .allowUnknownProperties()
)
