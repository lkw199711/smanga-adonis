/**
 * 共用的 VineJS 子 schema / 转换器
 *
 * 所有业务 validator 都可以从这里复用分页、CSV id 等片段,
 * 避免每个实体重复定义。
 */
import vine from '@vinejs/vine'

/**
 * 分页查询共用字段
 * - page / pageSize 允许缺省 (走不分页逻辑)
 * - order 保留字符串,具体可选值由各控制器内部判定
 */
export const paginationFields = {
  page: vine.number().positive().optional(),
  pageSize: vine.number().positive().optional(),
  order: vine.string().trim().optional(),
}

/**
 * 把形如 "1,2,3" 的 CSV 字符串转换为去重后的正整数数组
 * 允许前端或路由传 CSV,由 validator 层统一收口,控制器直接拿 number[]
 */
export function csvToPositiveIds(value: unknown): number[] {
  const source = Array.isArray(value)
    ? value
    : String(value ?? '').split(',')

  const ids = source
    .map((item) => Number(String(item).trim()))
    .filter((n) => Number.isFinite(n) && n > 0)

  return Array.from(new Set(ids))
}

/**
 * CSV id 串字段: 校验为非空字符串,再 transform 成 number[]
 * 注意 transform 之后无法再链式追加校验,非空判定在控制器或此处前置保证
 */
export const csvIdsField = vine
  .string()
  .trim()
  .minLength(1)
  .transform((value) => csvToPositiveIds(value))
