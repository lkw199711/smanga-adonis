import vine from '@vinejs/vine'

export const sliceChartValidator = vine.compile(
  vine.object({
    slice: vine.number().positive().optional(),
  })
)
