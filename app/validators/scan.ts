import vine from '@vinejs/vine'

export const idParamScanValidator = vine.compile(
  vine.object({
    scanId: vine.number().positive(),
  })
)

export const createScanValidator = vine.compile(
  vine
    .object({
      scanName: vine.string().trim().optional(),
      scanStatus: vine.string().trim().optional(),
      scanType: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

export const updateScanValidator = vine.compile(
  vine.object({
    scanName: vine.string().trim().optional(),
    scanStatus: vine.string().trim().optional(),
    scanType: vine.string().trim().optional(),
  })
)
