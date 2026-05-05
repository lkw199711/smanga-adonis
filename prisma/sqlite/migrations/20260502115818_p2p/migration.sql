-- CreateTable
CREATE TABLE "p2p_group" (
    "p2pGroupId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupNo" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "describe" TEXT,
    "ownerNodeId" TEXT NOT NULL,
    "isOwner" INTEGER NOT NULL DEFAULT 0,
    "trackerUrl" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "joinTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "p2p_local_share" (
    "p2pLocalShareId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "p2pGroupId" INTEGER NOT NULL,
    "shareType" TEXT NOT NULL DEFAULT 'media',
    "mediaId" INTEGER,
    "mangaId" INTEGER,
    "shareName" TEXT NOT NULL,
    "enable" INTEGER NOT NULL DEFAULT 1,
    "announceHash" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "p2p_local_share_p2pGroupId_fkey" FOREIGN KEY ("p2pGroupId") REFERENCES "p2p_group" ("p2pGroupId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "p2p_peer_cache" (
    "p2pPeerCacheId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "p2pGroupId" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeName" TEXT,
    "publicHost" TEXT,
    "publicPort" INTEGER,
    "localHost" TEXT,
    "localPort" INTEGER,
    "online" INTEGER NOT NULL DEFAULT 0,
    "version" TEXT,
    "lastSeen" DATETIME,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "p2p_peer_cache_p2pGroupId_fkey" FOREIGN KEY ("p2pGroupId") REFERENCES "p2p_group" ("p2pGroupId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "p2p_transfer" (
    "p2pTransferId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "p2pGroupId" INTEGER NOT NULL,
    "groupNo" TEXT NOT NULL DEFAULT '',
    "peerNodeId" TEXT NOT NULL,
    "peerBaseUrl" TEXT NOT NULL DEFAULT '',
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
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startTime" DATETIME,
    "endTime" DATETIME,
    CONSTRAINT "p2p_transfer_p2pGroupId_fkey" FOREIGN KEY ("p2pGroupId") REFERENCES "p2p_group" ("p2pGroupId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tracker_node" (
    "trackerNodeId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "lastHeartbeat" DATETIME,
    "totalUpload" BIGINT NOT NULL DEFAULT 0,
    "totalDownload" BIGINT NOT NULL DEFAULT 0,
    "banned" INTEGER NOT NULL DEFAULT 0,
    "bannedReason" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "tracker_group" (
    "trackerGroupId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupNo" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "describe" TEXT,
    "password" TEXT NOT NULL,
    "ownerNodeId" TEXT NOT NULL,
    "maxMembers" INTEGER NOT NULL DEFAULT 50,
    "memberCount" INTEGER NOT NULL DEFAULT 1,
    "enable" INTEGER NOT NULL DEFAULT 1,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tracker_group_ownerNodeId_fkey" FOREIGN KEY ("ownerNodeId") REFERENCES "tracker_node" ("nodeId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tracker_membership" (
    "trackerMembershipId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trackerGroupId" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAnnounce" DATETIME,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tracker_membership_trackerGroupId_fkey" FOREIGN KEY ("trackerGroupId") REFERENCES "tracker_group" ("trackerGroupId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tracker_membership_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "tracker_node" ("nodeId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tracker_invite" (
    "trackerInviteId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trackerGroupId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "usedBy" TEXT,
    "usedTime" DATETIME,
    "expires" DATETIME,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tracker_invite_trackerGroupId_fkey" FOREIGN KEY ("trackerGroupId") REFERENCES "tracker_group" ("trackerGroupId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tracker_share_index" (
    "trackerShareIndexId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tracker_share_index_trackerGroupId_fkey" FOREIGN KEY ("trackerGroupId") REFERENCES "tracker_group" ("trackerGroupId") ON DELETE RESTRICT ON UPDATE CASCADE
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
