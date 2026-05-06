-- CreateTable
CREATE TABLE "p2p_group" (
    "p2pGroupId" SERIAL NOT NULL,
    "groupNo" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "describe" TEXT,
    "ownerNodeId" TEXT NOT NULL,
    "isOwner" INTEGER NOT NULL DEFAULT 0,
    "trackerUrl" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "joinTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "p2p_group_pkey" PRIMARY KEY ("p2pGroupId")
);

-- CreateTable
CREATE TABLE "p2p_local_share" (
    "p2pLocalShareId" SERIAL NOT NULL,
    "p2pGroupId" INTEGER NOT NULL,
    "shareType" TEXT NOT NULL DEFAULT 'media',
    "mediaId" INTEGER,
    "mangaId" INTEGER,
    "shareName" TEXT NOT NULL,
    "enable" INTEGER NOT NULL DEFAULT 1,
    "announceHash" TEXT,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "p2p_local_share_pkey" PRIMARY KEY ("p2pLocalShareId")
);

-- CreateTable
CREATE TABLE "p2p_peer_cache" (
    "p2pPeerCacheId" SERIAL NOT NULL,
    "p2pGroupId" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeName" TEXT,
    "publicHost" TEXT,
    "publicPort" INTEGER,
    "localHost" TEXT,
    "localPort" INTEGER,
    "online" INTEGER NOT NULL DEFAULT 0,
    "version" TEXT,
    "lastSeen" TIMESTAMP(3),
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "p2p_peer_cache_pkey" PRIMARY KEY ("p2pPeerCacheId")
);

-- CreateTable
CREATE TABLE "p2p_transfer" (
    "p2pTransferId" SERIAL NOT NULL,
    "p2pGroupId" INTEGER NOT NULL,
    "groupNo" TEXT NOT NULL DEFAULT '',
    "peerNodeId" TEXT NOT NULL DEFAULT '',
    "transferType" TEXT NOT NULL,
    "remoteMediaId" INTEGER,
    "remoteMangaId" INTEGER,
    "remoteChapterId" INTEGER,
    "remoteName" TEXT NOT NULL,
    "receivedPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" BIGINT,
    "downloadedBytes" BIGINT NOT NULL DEFAULT 0,
    "speedBps" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "connectMode" TEXT,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),

    CONSTRAINT "p2p_transfer_pkey" PRIMARY KEY ("p2pTransferId")
);

-- CreateTable
CREATE TABLE "tracker_node" (
    "trackerNodeId" SERIAL NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeToken" TEXT NOT NULL,
    "nodeName" TEXT,
    "publicHost" TEXT,
    "publicPort" INTEGER,
    "localHost" TEXT,
    "localPort" INTEGER,
    "version" TEXT,
    "userAgent" TEXT,
    "online" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeat" TIMESTAMP(3),
    "totalUpload" BIGINT NOT NULL DEFAULT 0,
    "totalDownload" BIGINT NOT NULL DEFAULT 0,
    "banned" INTEGER NOT NULL DEFAULT 0,
    "bannedReason" TEXT,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracker_node_pkey" PRIMARY KEY ("trackerNodeId")
);

-- CreateTable
CREATE TABLE "tracker_group" (
    "trackerGroupId" SERIAL NOT NULL,
    "groupNo" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "describe" TEXT,
    "password" TEXT NOT NULL,
    "ownerNodeId" TEXT NOT NULL,
    "maxMembers" INTEGER NOT NULL DEFAULT 50,
    "memberCount" INTEGER NOT NULL DEFAULT 1,
    "enable" INTEGER NOT NULL DEFAULT 1,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracker_group_pkey" PRIMARY KEY ("trackerGroupId")
);

-- CreateTable
CREATE TABLE "tracker_membership" (
    "trackerMembershipId" SERIAL NOT NULL,
    "trackerGroupId" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAnnounce" TIMESTAMP(3),
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracker_membership_pkey" PRIMARY KEY ("trackerMembershipId")
);

-- CreateTable
CREATE TABLE "tracker_invite" (
    "trackerInviteId" SERIAL NOT NULL,
    "trackerGroupId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "usedBy" TEXT,
    "usedTime" TIMESTAMP(3),
    "expires" TIMESTAMP(3),
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracker_invite_pkey" PRIMARY KEY ("trackerInviteId")
);

-- CreateTable
CREATE TABLE "tracker_share_index" (
    "trackerShareIndexId" SERIAL NOT NULL,
    "trackerGroupId" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "shareType" TEXT NOT NULL DEFAULT 'media',
    "remoteMediaId" INTEGER,
    "remoteMangaId" INTEGER,
    "shareName" TEXT NOT NULL,
    "coverUrl" TEXT,
    "mangaCount" INTEGER NOT NULL DEFAULT 0,
    "totalSize" BIGINT,
    "enable" INTEGER NOT NULL DEFAULT 1,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracker_share_index_pkey" PRIMARY KEY ("trackerShareIndexId")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniqueP2pGroupNo" ON "p2p_group"("groupNo");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueGroupShare" ON "p2p_local_share"("p2pGroupId", "shareType", "mediaId", "mangaId");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueGroupNode" ON "p2p_peer_cache"("p2pGroupId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueTrackerNodeId" ON "tracker_node"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueTrackerGroupNo" ON "tracker_group"("groupNo");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueTrackerMembership" ON "tracker_membership"("trackerGroupId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueTrackerInviteCode" ON "tracker_invite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueShareIndex" ON "tracker_share_index"("trackerGroupId", "nodeId", "shareType", "remoteMediaId", "remoteMangaId");

-- AddForeignKey
ALTER TABLE "p2p_local_share" ADD CONSTRAINT "p2p_local_share_p2pGroupId_fkey" FOREIGN KEY ("p2pGroupId") REFERENCES "p2p_group"("p2pGroupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p2p_peer_cache" ADD CONSTRAINT "p2p_peer_cache_p2pGroupId_fkey" FOREIGN KEY ("p2pGroupId") REFERENCES "p2p_group"("p2pGroupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p2p_transfer" ADD CONSTRAINT "p2p_transfer_p2pGroupId_fkey" FOREIGN KEY ("p2pGroupId") REFERENCES "p2p_group"("p2pGroupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracker_group" ADD CONSTRAINT "tracker_group_ownerNodeId_fkey" FOREIGN KEY ("ownerNodeId") REFERENCES "tracker_node"("nodeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracker_membership" ADD CONSTRAINT "tracker_membership_trackerGroupId_fkey" FOREIGN KEY ("trackerGroupId") REFERENCES "tracker_group"("trackerGroupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracker_membership" ADD CONSTRAINT "tracker_membership_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "tracker_node"("nodeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracker_invite" ADD CONSTRAINT "tracker_invite_trackerGroupId_fkey" FOREIGN KEY ("trackerGroupId") REFERENCES "tracker_group"("trackerGroupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracker_share_index" ADD CONSTRAINT "tracker_share_index_trackerGroupId_fkey" FOREIGN KEY ("trackerGroupId") REFERENCES "tracker_group"("trackerGroupId") ON DELETE RESTRICT ON UPDATE CASCADE;
