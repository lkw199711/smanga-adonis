-- CreateTable
CREATE TABLE `p2p_group` (
    `p2pGroupId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `groupNo` VARCHAR(32) NOT NULL,
    `groupName` VARCHAR(191) NOT NULL,
    `describe` VARCHAR(500) NULL,
    `ownerNodeId` VARCHAR(64) NOT NULL,
    `isOwner` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `trackerUrl` VARCHAR(255) NOT NULL,
    `memberCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `joinTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `lastSyncTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueP2pGroupNo`(`groupNo`),
    PRIMARY KEY (`p2pGroupId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `p2p_local_share` (
    `p2pLocalShareId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `p2pGroupId` INTEGER UNSIGNED NOT NULL,
    `shareType` VARCHAR(32) NOT NULL DEFAULT 'media',
    `mediaId` INTEGER UNSIGNED NULL,
    `mangaId` INTEGER UNSIGNED NULL,
    `shareName` VARCHAR(191) NOT NULL,
    `enable` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `announceHash` VARCHAR(64) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueGroupShare`(`p2pGroupId`, `shareType`, `mediaId`, `mangaId`),
    PRIMARY KEY (`p2pLocalShareId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `p2p_peer_cache` (
    `p2pPeerCacheId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `p2pGroupId` INTEGER UNSIGNED NOT NULL,
    `nodeId` VARCHAR(64) NOT NULL,
    `nodeName` VARCHAR(191) NULL,
    `publicHost` VARCHAR(191) NULL,
    `publicPort` INTEGER UNSIGNED NULL,
    `localHost` VARCHAR(191) NULL,
    `localPort` INTEGER UNSIGNED NULL,
    `online` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `version` VARCHAR(32) NULL,
    `lastSeen` DATETIME(6) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueGroupNode`(`p2pGroupId`, `nodeId`),
    PRIMARY KEY (`p2pPeerCacheId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `p2p_transfer` (
    `p2pTransferId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `p2pGroupId` INTEGER UNSIGNED NOT NULL,
    `groupNo` VARCHAR(64) NOT NULL DEFAULT '',
    `peerNodeId` VARCHAR(64) NOT NULL DEFAULT '',
    `transferType` VARCHAR(32) NOT NULL,
    `remoteMediaId` INTEGER UNSIGNED NULL,
    `remoteMangaId` INTEGER UNSIGNED NULL,
    `remoteChapterId` INTEGER UNSIGNED NULL,
    `remoteName` VARCHAR(191) NOT NULL,
    `receivedPath` VARCHAR(500) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
    `progress` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `totalBytes` BIGINT UNSIGNED NULL,
    `downloadedBytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `speedBps` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `error` TEXT NULL,
    `connectMode` VARCHAR(32) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `startTime` DATETIME(6) NULL,
    `endTime` DATETIME(6) NULL,

    PRIMARY KEY (`p2pTransferId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tracker_node` (
    `trackerNodeId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `nodeId` VARCHAR(64) NOT NULL,
    `nodeToken` VARCHAR(128) NOT NULL,
    `nodeName` VARCHAR(191) NULL,
    `publicHost` VARCHAR(191) NULL,
    `publicPort` INTEGER UNSIGNED NULL,
    `localHost` VARCHAR(191) NULL,
    `localPort` INTEGER UNSIGNED NULL,
    `version` VARCHAR(32) NULL,
    `userAgent` VARCHAR(255) NULL,
    `online` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `lastHeartbeat` DATETIME(6) NULL,
    `totalUpload` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `totalDownload` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `banned` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `bannedReason` VARCHAR(255) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueTrackerNodeId`(`nodeId`),
    PRIMARY KEY (`trackerNodeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tracker_group` (
    `trackerGroupId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `groupNo` VARCHAR(32) NOT NULL,
    `groupName` VARCHAR(191) NOT NULL,
    `describe` VARCHAR(500) NULL,
    `password` VARCHAR(191) NOT NULL,
    `ownerNodeId` VARCHAR(64) NOT NULL,
    `maxMembers` INTEGER UNSIGNED NOT NULL DEFAULT 50,
    `memberCount` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `enable` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueTrackerGroupNo`(`groupNo`),
    PRIMARY KEY (`trackerGroupId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tracker_membership` (
    `trackerMembershipId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `trackerGroupId` INTEGER UNSIGNED NOT NULL,
    `nodeId` VARCHAR(64) NOT NULL,
    `role` VARCHAR(32) NOT NULL DEFAULT 'member',
    `joinTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `lastAnnounce` DATETIME(6) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueTrackerMembership`(`trackerGroupId`, `nodeId`),
    PRIMARY KEY (`trackerMembershipId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tracker_invite` (
    `trackerInviteId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `trackerGroupId` INTEGER UNSIGNED NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `createdBy` VARCHAR(64) NOT NULL,
    `usedBy` VARCHAR(64) NULL,
    `usedTime` DATETIME(6) NULL,
    `expires` DATETIME(6) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueTrackerInviteCode`(`code`),
    PRIMARY KEY (`trackerInviteId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tracker_share_index` (
    `trackerShareIndexId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `trackerGroupId` INTEGER UNSIGNED NOT NULL,
    `nodeId` VARCHAR(64) NOT NULL,
    `shareType` VARCHAR(32) NOT NULL DEFAULT 'media',
    `remoteMediaId` INTEGER UNSIGNED NULL,
    `remoteMangaId` INTEGER UNSIGNED NULL,
    `shareName` VARCHAR(191) NOT NULL,
    `coverUrl` VARCHAR(500) NULL,
    `mangaCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `totalSize` BIGINT UNSIGNED NULL,
    `enable` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueShareIndex`(`trackerGroupId`, `nodeId`, `shareType`, `remoteMediaId`, `remoteMangaId`),
    PRIMARY KEY (`trackerShareIndexId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `p2p_local_share` ADD CONSTRAINT `p2p_local_share_p2pGroupId_fkey` FOREIGN KEY (`p2pGroupId`) REFERENCES `p2p_group`(`p2pGroupId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_peer_cache` ADD CONSTRAINT `p2p_peer_cache_p2pGroupId_fkey` FOREIGN KEY (`p2pGroupId`) REFERENCES `p2p_group`(`p2pGroupId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_transfer` ADD CONSTRAINT `p2p_transfer_p2pGroupId_fkey` FOREIGN KEY (`p2pGroupId`) REFERENCES `p2p_group`(`p2pGroupId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tracker_group` ADD CONSTRAINT `tracker_group_ownerNodeId_fkey` FOREIGN KEY (`ownerNodeId`) REFERENCES `tracker_node`(`nodeId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tracker_membership` ADD CONSTRAINT `tracker_membership_trackerGroupId_fkey` FOREIGN KEY (`trackerGroupId`) REFERENCES `tracker_group`(`trackerGroupId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tracker_membership` ADD CONSTRAINT `tracker_membership_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `tracker_node`(`nodeId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tracker_invite` ADD CONSTRAINT `tracker_invite_trackerGroupId_fkey` FOREIGN KEY (`trackerGroupId`) REFERENCES `tracker_group`(`trackerGroupId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tracker_share_index` ADD CONSTRAINT `tracker_share_index_trackerGroupId_fkey` FOREIGN KEY (`trackerGroupId`) REFERENCES `tracker_group`(`trackerGroupId`) ON DELETE RESTRICT ON UPDATE CASCADE;
