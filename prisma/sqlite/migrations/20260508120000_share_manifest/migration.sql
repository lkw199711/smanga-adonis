-- 共享清单系统三张新表(tracker端权威 + 节点端缓存 + 拉取端缓存)

-- ============ tracker_share_manifest ============
CREATE TABLE "tracker_share_manifest" (
    "trackerShareManifestId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trackerGroupId" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "shareType" TEXT NOT NULL DEFAULT 'media',
    "remoteMediaId" INTEGER,
    "remoteMangaId" INTEGER,
    "version" BIGINT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "payloadTruncated" INTEGER NOT NULL DEFAULT 0,
    "payloadSize" INTEGER NOT NULL DEFAULT 0,
    "shareName" TEXT NOT NULL,
    "coverUrl" TEXT,
    "coverSize" INTEGER,
    "describe" TEXT,
    "mangaCount" INTEGER NOT NULL DEFAULT 0,
    "chapterCount" INTEGER NOT NULL DEFAULT 0,
    "totalSize" BIGINT,
    "payload" TEXT NOT NULL,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tracker_share_manifest_trackerGroupId_fkey" FOREIGN KEY ("trackerGroupId") REFERENCES "tracker_group" ("trackerGroupId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uniqueShareManifest" ON "tracker_share_manifest"("trackerGroupId", "nodeId", "shareType", "remoteMediaId", "remoteMangaId");
CREATE INDEX "idxShareManifestUpdate" ON "tracker_share_manifest"("trackerGroupId", "updateTime");

-- ============ p2p_local_share_manifest ============
CREATE TABLE "p2p_local_share_manifest" (
    "p2pLocalShareManifestId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "p2pLocalShareId" INTEGER NOT NULL,
    "version" BIGINT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "payloadSize" INTEGER NOT NULL DEFAULT 0,
    "payloadTruncated" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT NOT NULL,
    "lastAnnounceTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "p2p_local_share_manifest_p2pLocalShareId_key" ON "p2p_local_share_manifest"("p2pLocalShareId");

-- ============ p2p_peer_share_manifest ============
CREATE TABLE "p2p_peer_share_manifest" (
    "p2pPeerShareManifestId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "p2pGroupId" INTEGER NOT NULL,
    "ownerNodeId" TEXT NOT NULL,
    "shareType" TEXT NOT NULL DEFAULT 'media',
    "remoteMediaId" INTEGER,
    "remoteMangaId" INTEGER,
    "version" BIGINT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "payloadTruncated" INTEGER NOT NULL DEFAULT 0,
    "shareName" TEXT NOT NULL,
    "coverUrl" TEXT,
    "describe" TEXT,
    "mangaCount" INTEGER NOT NULL DEFAULT 0,
    "chapterCount" INTEGER NOT NULL DEFAULT 0,
    "totalSize" BIGINT,
    "payload" TEXT,
    "fetchTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "p2p_peer_share_manifest_p2pGroupId_fkey" FOREIGN KEY ("p2pGroupId") REFERENCES "p2p_group" ("p2pGroupId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uniquePeerShareManifest" ON "p2p_peer_share_manifest"("p2pGroupId", "ownerNodeId", "shareType", "remoteMediaId", "remoteMangaId");
CREATE INDEX "idxPeerShareManifestUpdate" ON "p2p_peer_share_manifest"("p2pGroupId", "updateTime");