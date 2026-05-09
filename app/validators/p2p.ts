import vine from '@vinejs/vine'

// ========== p2p_verify ==========
export const p2pVerifyEchoValidator = vine.compile(
  vine
    .object({
      challenge: vine.string().trim().minLength(1),
      nodeId: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

// ========== p2p_groups ==========
export const idParamP2PValidator = vine.compile(
  vine.object({ id: vine.number().positive() })
)

export const groupNoParamValidator = vine.compile(
  vine.object({ groupNo: vine.string().trim().minLength(1) })
)

export const groupKickParamValidator = vine.compile(
  vine.object({
    groupNo: vine.string().trim().minLength(1),
    nodeId: vine.string().trim().minLength(1),
  })
)

export const createP2PGroupValidator = vine.compile(
  vine
    .object({
      groupName: vine.string().trim().minLength(1),
      describe: vine.string().trim().optional(),
      password: vine.string().trim().optional(),
      maxMembers: vine.any().optional(),
    })
    .allowUnknownProperties()
)

export const joinP2PGroupValidator = vine.compile(
  vine
    .object({
      groupNo: vine.string().trim().minLength(1),
      password: vine.string().trim().optional(),
      inviteCode: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

export const leaveP2PGroupValidator = vine.compile(
  vine.object({ groupNo: vine.string().trim().minLength(1) })
)

export const kickP2PGroupValidator = vine.compile(
  vine.object({
    groupNo: vine.string().trim().minLength(1),
    targetNodeId: vine.string().trim().minLength(1),
  })
)

export const dismissP2PGroupValidator = vine.compile(
  vine.object({ groupNo: vine.string().trim().minLength(1) })
)

// ========== p2p_peers ==========
export const peerManifestsQueryValidator = vine.compile(
  vine
    .object({
      since: vine.any().optional(),
      nodeId: vine.string().trim().optional(),
      sync: vine.any().optional(),
      fallback: vine.any().optional(),
    })
    .allowUnknownProperties()
)

export const peerManifestQueryValidator = vine.compile(
  vine
    .object({
      nodeId: vine.string().trim().minLength(1),
      shareType: vine.string().trim().minLength(1),
      remoteMediaId: vine.any().optional(),
      remoteMangaId: vine.any().optional(),
    })
    .allowUnknownProperties()
)

export const peerMangaTreeQueryValidator = vine.compile(
  vine
    .object({
      remoteMangaId: vine.number().positive(),
    })
    .allowUnknownProperties()
)

export const peerChapterTreeQueryValidator = vine.compile(
  vine
    .object({
      remoteMangaId: vine.number().positive(),
      remoteChapterId: vine.number().positive(),
    })
    .allowUnknownProperties()
)

// ========== p2p_shares ==========
export const listP2PShareQueryValidator = vine.compile(
  vine
    .object({
      groupNo: vine.string().trim().optional(),
      page: vine.number().positive().optional(),
      pageSize: vine.number().positive().optional(),
    })
    .allowUnknownProperties()
)

export const createP2PShareValidator = vine.compile(
  vine
    .object({
      groupNo: vine.string().trim().minLength(1),
      shareType: vine.string().trim().minLength(1),
      mediaId: vine.any().optional(),
      mangaId: vine.any().optional(),
      shareName: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

export const updateP2PShareValidator = vine.compile(
  vine
    .object({
      enable: vine.any().optional(),
      shareName: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

export const announceP2PShareValidator = vine.compile(
  vine.object({ groupNo: vine.string().trim().minLength(1) })
)

// ========== p2p_transfers ==========
export const listP2PTransferQueryValidator = vine.compile(
  vine
    .object({
      status: vine.string().trim().optional(),
      groupNo: vine.string().trim().optional(),
      page: vine.number().positive().optional(),
      pageSize: vine.number().positive().optional(),
    })
    .allowUnknownProperties()
)

export const pullP2PTransferValidator = vine.compile(
  vine
    .object({
      groupNo: vine.string().trim().optional(),
      transferType: vine.string().trim().optional(),
      remoteMediaId: vine.any().optional(),
      remoteMangaId: vine.any().optional(),
      remoteChapterId: vine.any().optional(),
      remoteName: vine.string().trim().optional(),
      receivedPath: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

export const clearP2PTransferValidator = vine.compile(
  vine
    .object({
      status: vine.string().trim().optional(),
    })
    .allowUnknownProperties()
)

// ========== p2p_serve ==========
export const mediaIdParamValidator = vine.compile(
  vine.object({ mediaId: vine.number().positive() })
)

export const mangaIdParamValidator = vine.compile(
  vine.object({ mangaId: vine.number().positive() })
)

export const chapterIdParamValidator = vine.compile(
  vine.object({ chapterId: vine.number().positive() })
)

export const fileBodyValidator = vine.compile(
  vine
    .object({
      file: vine.string().trim().minLength(1),
    })
    .allowUnknownProperties()
)
