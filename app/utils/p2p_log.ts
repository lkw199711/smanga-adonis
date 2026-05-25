/**
 * P2P / Tracker 模块统一错误日志工具
 *
 * 使用场景:在 controller / service 的 catch 分支里打印结构化的错误信息,
 * 便于在 adonis 控制台中快速定位到:
 *  - 本层报错 message
 *  - tracker / 对端节点返回的 HTTP 错误体
 *  - 原始 stack
 *
 * 约定:
 *  - 所有 P2P 侧模块统一使用 log_p2p_error(tag, err)
 *  - 所有 Tracker 侧模块统一使用 log_tracker_error(tag, err)
 *  - tag 推荐格式: "模块.动作" ,例如 "group.create" / "share.announce"
 */

/**
 * 提取 axios / 普通 Error 的结构化关键字段
 */
function extract_error_fields(err: any) {
  return {
    message: err?.message,
    remoteMessage: err?.response?.data?.message,
    remoteStatus: err?.response?.status,
    remoteData: err?.response?.data,
    stack: err?.stack,
  }
}

/**
 * P2P 用户侧 / 节点间错误日志
 */
export function log_p2p_error(tag: string, err: any) {
  console.error(`[p2p] ${tag} failed:`, extract_error_fields(err))
}

/**
 * Tracker 服务端错误日志
 */
export function log_tracker_error(tag: string, err: any) {
  console.error(`[tracker] ${tag} failed:`, extract_error_fields(err))
}

/**
 * 从任意错误对象中提取人类可读的错误消息。
 *
 * 处理优先级:
 *  1. AggregateError → 展平 errors[] 中的所有子错误消息
 *  2. axios 错误 → 优先取远端返回的 message,其次取本地 message
 *  3. 普通 Error → message || stack
 *  4. 其他 → String(err)
 */
export function extractErrorMessage(err: any): string {
  if (!err) return '未知错误'

  // AggregateError (Promise.any / 部分 Prisma 批处理)
  if (err instanceof AggregateError && Array.isArray(err.errors) && err.errors.length) {
    const parts = err.errors.map((e: any) => {
      if (e?.response?.data?.message) return e.response.data.message
      if (e?.message) return e.message
      return String(e)
    })
    // 去重后拼接
    const unique = [...new Set(parts)]
    return unique.join('; ')
  }

  // axios 风格错误
  if (err?.response?.data?.message) {
    const ctx = err?.config?.url ? `[${err.config.url}] ` : ''
    return `${ctx}${err.response.data.message}`
  }

  // 普通 Error
  if (err instanceof Error) {
    return err.message || err.stack || String(err)
  }

  // 其他
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

export default { log_p2p_error, log_tracker_error, extractErrorMessage }