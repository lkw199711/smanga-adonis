import vine from '@vinejs/vine'

// ========== tracker 共用 params ==========
export const trackerGroupNoParamValidator = vine.compile(
  vine.object({ groupNo: vine.string().trim().minLength(1) })
)

export const trackerGroupKickParamValidator = vine.compile(
  vine.object({
    groupNo: vine.string().trim().minLength(1),
    nodeId: vine.string().trim().minLength(1),
  })
)

// ========== tracker_groups ==========
export const createTrackerGroupValidator = vine.compile(
  vine
    .object({
      groupName: vine.string().trim().minLength(1),
      describe: vine.string().trim().optional(),
      password: vine.string().trim().optional(),
      maxMembers: vine.any().optional(),
    })
    .allowUnknownProperties()
)

export const joinTrackerGroupValidator = vine.compile(
  vine
    .object({
      groupNo: vine.string().trim().minLength(1),
      password: vine.string().trim().optional(),
      inviteCode: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

export const inviteTrackerGroupValidator = vine.compile(
  vine
    .object({
      expiresHours: vine.any().optional(),
    })
    .allowUnknownProperties()
)

// ========== tracker_nodes ==========
export const registerTrackerNodeValidator = vine.compile(
  vine
    .object({
      nodeName: vine.string().trim().optional(),
      version: vine.string().trim().optional(),
      publicUrl: vine.string().trim().optional(),
      inviteCode: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

export const heartbeatTrackerNodeValidator = vine.compile(
  vine
    .object({
      publicUrl: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

export const updateTrackerNodeValidator = vine.compile(
  vine
    .object({
      nodeName: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

// ========== tracker_shares ==========
export const announceTrackerShareValidator = vine.compile(
  vine
    .object({
      shares: vine.any().optional(),
    })
    .allowUnknownProperties()
)

export const seedsTrackerShareValidator = vine.compile(
  vine
    .object({
      shareType: vine.string().trim().optional(),
      remoteMediaId: vine.any().optional(),
      remoteMangaId: vine.any().optional(),
    })
    .allowUnknownProperties()
)

export const manifestsTrackerShareValidator = vine.compile(
  vine
    .object({
      since: vine.any().optional(),
      nodeId: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

export const manifestTrackerShareValidator = vine.compile(
  vine
    .object({
      nodeId: vine.string().trim().optional(),
      shareType: vine.string().trim().optional(),
      remoteMediaId: vine.any().optional(),
      remoteMangaId: vine.any().optional(),
    })
    .allowUnknownProperties()
)

export const listTrackerShareValidator = vine.compile(
  vine
    .object({
      page: vine.any().optional(),
      pageSize: vine.any().optional(),
      keyword: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

// ========== tracker_admin_groups ==========
export const listTrackerAdminGroupValidator = vine.compile(
  vine
    .object({
      page: vine.any().optional(),
      pageSize: vine.any().optional(),
      keyword: vine.string().trim().optional(),
      enable: vine.any().optional(),
    })
    .allowUnknownProperties()
)
