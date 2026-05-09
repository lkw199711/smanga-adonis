import vine from '@vinejs/vine'

export const idParamTaskSuccessValidator = vine.compile(
  vine.object({
    taskSuccessId: vine.number().positive(),
  })
)

export const createTaskSuccessValidator = vine.compile(
  vine
    .object({
      taskId: vine.string().trim().optional(),
      taskName: vine.string().trim().optional(),
      taskStatus: vine.string().trim().optional(),
      taskType: vine.string().trim().optional(),
      taskTime: vine.any().optional(),
      taskMessage: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

export const updateTaskSuccessValidator = vine.compile(
  vine.object({
    taskId: vine.string().trim().optional(),
    taskName: vine.string().trim().optional(),
    taskStatus: vine.string().trim().optional(),
    taskType: vine.string().trim().optional(),
    taskTime: vine.any().optional(),
    taskMessage: vine.string().trim().optional(),
  })
)
