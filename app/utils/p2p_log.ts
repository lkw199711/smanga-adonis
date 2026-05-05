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

export default { log_p2p_error, log_tracker_error }