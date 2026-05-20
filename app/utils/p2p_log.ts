import log from '#services/log_service'

function extract_error_fields(err: any) {
  return {
    message: err?.message,
    remoteMessage: err?.response?.data?.message,
    remoteStatus: err?.response?.status,
    remoteData: err?.response?.data,
    stack: err?.stack,
  }
}

export function log_p2p_error(tag: string, err: any) {
  const fields = extract_error_fields(err)

  void log.error({
    type: 'p2p',
    module: 'p2p',
    action: `${tag}.failed`,
    message: `[p2p] ${tag} failed`,
    error: err,
    context: {
      tag,
      ...fields,
    },
  })
}

export function log_p2p_info(tag: string, context?: Record<string, unknown>) {
  const payload = context || {}

  void log.info({
    type: 'p2p',
    module: 'p2p',
    action: tag,
    message: `[p2p] ${tag}`,
    context: {
      tag,
      ...payload,
    },
  })
}

export function log_tracker_error(tag: string, err: any) {
  const fields = extract_error_fields(err)

  void log.error({
    type: 'tracker',
    module: 'tracker',
    action: `${tag}.failed`,
    message: `[tracker] ${tag} failed`,
    error: err,
    context: {
      tag,
      ...fields,
    },
  })
}

export function log_tracker_info(tag: string, context?: Record<string, unknown>) {
  const payload = context || {}

  void log.info({
    type: 'tracker',
    module: 'tracker',
    action: tag,
    message: `[tracker] ${tag}`,
    context: {
      tag,
      ...payload,
    },
  })
}

export default { log_p2p_error, log_p2p_info, log_tracker_error, log_tracker_info }
