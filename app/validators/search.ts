import vine from '@vinejs/vine'

export const searchMangaValidator = vine.compile(
  vine.object({
    searchText: vine.string().trim().optional(),
    searchType: vine.string().trim().optional(),
    page: vine.number().positive(),
    pageSize: vine.number().positive(),
    order: vine.any().optional(),
  })
)

export const searchChapterValidator = vine.compile(
  vine.object({
    searchText: vine.string().trim().optional(),
    page: vine.number().positive(),
    pageSize: vine.number().positive(),
    order: vine.any().optional(),
  })
)
