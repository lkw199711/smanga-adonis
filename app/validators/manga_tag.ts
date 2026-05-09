import vine from '@vinejs/vine'

export const idParamMangaTagValidator = vine.compile(
  vine.object({
    mangaTagId: vine.number().positive(),
  })
)

export const createMangaTagValidator = vine.compile(
  vine.object({
    mangaId: vine.number().positive(),
    tagId: vine.number().positive(),
  })
)

export const updateMangaTagValidator = vine.compile(
  vine.object({
    mangaId: vine.number().positive().optional(),
    tagId: vine.number().positive().optional(),
  })
)
