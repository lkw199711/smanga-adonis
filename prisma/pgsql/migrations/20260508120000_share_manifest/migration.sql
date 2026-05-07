-- 共享清单系统三张新表(tracker端权威 + 节点端缓存 + 拉取端缓存)

-- CreateTable
CREATE TABLE "tracker_share_manifest" (
    "trackerShareManifestId" SERIAL NOT NULL,
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
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracker_share_manifest_pkey" PRIMARY KEY ("trackerShareManifestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniqueShareManifest" ON "tracker_share_manifest"("trackerGroupId", "nodeId", "shareType", "remoteMediaId", "remoteMangaId");

-- CreateIndex
CREATE INDEX "idxShareManifestUpdate" ON "tracker_share_manifest"("trackerGroupId", "updateTime");

-- CreateTable
CREATE TABLE "p2p_local_share_manifest" (
    "p2pLocalShareManifestId" SERIAL NOT NULL,
    "p2pLocalShareId" INTEGER NOT NULL,
    "version" BIGINT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "payloadSize" INTEGER NOT NULL DEFAULT 0,
    "payloadTruncated" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT NOT NULL,
    "lastAnnounceTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "p2p_local_share_manifest_pkey" PRIMARY KEY ("p2pLocalShareManifestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniqueLocalShareManifest" ON "p2p_local_share_manifest"("p2pLocalShareId");

-- CreateTable
CREATE TABLE "p2p_peer_share_manifest" (
    "p2pPeerShareManifestId" SERIAL NOT NULL,
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
    "fetchTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "p2p_peer_share_manifest_pkey" PRIMARY KEY ("p2pPeerShareManifestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniquePeerShareManifest" ON "p2p_peer_share_manifest"("p2pGroupId", "ownerNodeId", "shareType", "remoteMediaId", "remoteMangaId");

-- CreateIndex
CREATE INDEX "idxPeerShareManifestUpdate" ON "p2p_peer_share_manifest"("p2pGroupId", "updateTime");

-- AddForeignKey
ALTER TABLE "tracker_share_manifest" ADD CONSTRAINT "tracker_share_manifest_trackerGroupId_fkey" FOREIGN KEY ("trackerGroupId") REFERENCES "tracker_group"("trackerGroupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p2p_peer_share_manifest" ADD CONSTRAINT "p2p_peer_share_manifest_p2pGroupId_fkey" FOREIGN KEY ("p2pGroupId") REFERENCES "p2p_group"("p2pGroupId") ON DELETE RESTRICT ON UPDATE CASCADE;