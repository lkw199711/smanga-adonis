import vine from '@vinejs/vine'

export const idParamTaskFailedValidator = vine.compile(
  vine.object({
    taskFailedId: vine.number().positive(),
  })
)

export const createTaskFailedValidator = vine.compile(
  vine
    .object({
      taskId: vine.string().trim().optional(),
      taskName: vine.string().trim().optional(),
      taskStatus: vine.string().trim().optional(),
      taskType: vine.string().trim().optional(),
      taskContent: vine.any().optional(),
    })
    .allowUnknownProperties()
)

export const updateTaskFailedValidator = vine.compile(
  vine.object({
    taskId: vine.string().trim().optional(),
    taskName: vine.string().trim().optional(),
    taskStatus: vine.string().trim().optional(),
    taskType: vine.string().trim().optional(),
    taskContent: vine.any().optional(),
  })
)
