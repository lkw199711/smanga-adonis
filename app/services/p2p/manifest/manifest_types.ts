/**
 * 共享清单(Share Manifest)类型定义
 *
 * 三端共用:
 *   - 节点端生成 manifest 后 announce 给 tracker
 *   - tracker 持久化到 tracker_share_manifest
 *   - 拉取端缓存到 p2p_peer_share_manifest
 *
 * payload 设计:
 *   - 精简版(总是包含):元数据 + manga 列表 + chapter 列表
 *   - 详情版(可选):每个 manga 的文件树
 *   - 总大小超过 PAYLOAD_MAX_BYTES 时,自动剥离文件树并标记 payloadTruncated
 */

/** payload 最大字节数(超过则不带详细文件树) */
export const PAYLOAD_MAX_BYTES = 100 * 1024

/** 单个 chapter 的文件树节点(精简) */
export type ManifestTreeNode = {
  /** 'd' = 目录, 'f' = 文件 */
  t: 'd' | 'f'
  /** 文件/目录名 */
  n: string
  /** 文件大小(字节,目录恒 0) */
  s: number
  /** 子节点(仅目录有) */
  c?: ManifestTreeNode[]
}

/** manifest 中的 chapter 元数据(可选含文件树) */
export type ManifestChapter = {
  remoteChapterId: number
  chapterName: string
  chapterType: string
  /** 估算或真实大小(字节) */
  size: number
  imageCount: number
  /** 文件树:仅在 share-level payload 体积允许时附带 */
  tree?: ManifestTreeNode[]
}

/** manifest 中的 manga 元数据 */
export type ManifestManga = {
  remoteMangaId: number
  mangaName: string
  mangaCover: string | null
  describe: string | null
  author: string | null
  chapterCount: number
  /** 估算总大小(所有 chapter size 之和) */
  totalSize: number
  chapters: ManifestChapter[]
}

/** manifest 顶层 payload */
export type ManifestPayload = {
  /** 协议版本,用于未来兼容性 */
  schema: 'share-manifest/v1'
  /** 生成时间(毫秒) */
  generatedAt: number
  /** 节点信息 */
  node: {
    nodeId: string
    nodeName?: string
    version?: string
  }
  /** 共享标识 */
  share: {
    shareType: 'media' | 'manga'
    remoteMediaId: number | null
    remoteMangaId: number | null
    shareName: string
    coverUrl: string | null
    coverSize: number | null
    describe: string | null
  }
  /** 汇总统计 */
  stats: {
    mangaCount: number
    chapterCount: number
    /** 估算总大小(字节) */
    totalSize: number
  }
  /** 漫画列表 */
  mangas: ManifestManga[]
}

/** manifest 构建结果(节点端) */
export type BuildManifestResult = {
  payload: ManifestPayload
  /** 序列化后字节数 */
  payloadSize: number
  /** 是否因体积超限剥离了文件树 */
  payloadTruncated: boolean
  /** SHA1 hash(基于序列化后的 payload 字符串) */
  contentHash: string
  /** 序列化后的 JSON 字符串(直接用于 announce/db 存储) */
  payloadJson: string
}