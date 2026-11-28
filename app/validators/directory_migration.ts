import vine from '@vinejs/vine'

export const createMigrationTargetValidator = vine.compile(
  vine.object({ targetPath: vine.string().trim().minLength(1).maxLength(4096) })
)

export const directoryMigrationValidator = vine.compile(
  vine.object({
    sourcePath: vine.string().trim().minLength(1).maxLength(4096),
    targetPath: vine.string().trim().minLength(1).maxLength(4096),
    mirrorDelete: vine.boolean().optional(),
    deleteSource: vine.boolean().optional(),
  })
)
