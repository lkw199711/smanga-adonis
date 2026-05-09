/**
 * 任务模块入参 validator
 * 注意: Bull 队列 job id 是字符串 (通常为数字字符串或 uuid),不强转 number
 */
import vine from '@vinejs/vine'

export const idParamTaskValidator = vine.compile(
  vine.object({
    taskId: vine.string().trim().minLength(1),
  })
)

// 批量: taskIds 为 CSV 字符串,校验非空后 transform 为字符串数组
export const batchIdsParamTaskValidator = vine.compile(
  vine.object({
    taskIds: vine
      .string()
      .trim()
      .minLength(1)
      .transform((value) => {
        return String(value)
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      }),
  })
)
