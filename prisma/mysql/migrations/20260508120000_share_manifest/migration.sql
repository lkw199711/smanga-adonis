-- 共享清单系统三张新表(tracker端权威 + 节点端缓存 + 拉取端缓存)

-- CreateTable
CREATE TABLE `tracker_share_manifest` (
    `trackerShareManifestId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `trackerGroupId` INTEGER UNSIGNED NOT NULL,
    `nodeId` VARCHAR(64) NOT NULL,
    `shareType` VARCHAR(32) NOT NULL DEFAULT 'media',
    `remoteMediaId` INTEGER UNSIGNED NULL,
    `remoteMangaId` INTEGER UNSIGNED NULL,
    `version` BIGINT UNSIGNED NOT NULL,
    `contentHash` VARCHAR(64) NOT NULL,
    `payloadTruncated` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `payloadSize` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `shareName` VARCHAR(191) NOT NULL,
    `coverUrl` VARCHAR(500) NULL,
    `coverSize` INTEGER UNSIGNED NULL,
    `describe` VARCHAR(500) NULL,
    `mangaCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `chapterCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `totalSize` BIGINT UNSIGNED NULL,
    `payload` MEDIUMTEXT NOT NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueShareManifest`(`trackerGroupId`, `nodeId`, `shareType`, `remoteMediaId`, `remoteMangaId`),
    INDEX `idxShareManifestUpdate`(`trackerGroupId`, `updateTime`),
    PRIMARY KEY (`trackerShareManifestId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `p2p_local_share_manifest` (
    `p2pLocalShareManifestId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `p2pLocalShareId` INTEGER UNSIGNED NOT NULL,
    `version` BIGINT UNSIGNED NOT NULL,
    `contentHash` VARCHAR(64) NOT NULL,
    `payloadSize` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `payloadTruncated` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `payload` MEDIUMTEXT NOT NULL,
    `lastAnnounceTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueLocalShareManifest`(`p2pLocalShareId`),
    PRIMARY KEY (`p2pLocalShareManifestId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `p2p_peer_share_manifest` (
    `p2pPeerShareManifestId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `p2pGroupId` INTEGER UNSIGNED NOT NULL,
    `ownerNodeId` VARCHAR(64) NOT NULL,
    `shareType` VARCHAR(32) NOT NULL DEFAULT 'media',
    `remoteMediaId` INTEGER UNSIGNED NULL,
    `remoteMangaId` INTEGER UNSIGNED NULL,
    `version` BIGINT UNSIGNED NOT NULL,
    `contentHash` VARCHAR(64) NOT NULL,
    `payloadTruncated` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `shareName` VARCHAR(191) NOT NULL,
    `coverUrl` VARCHAR(500) NULL,
    `describe` VARCHAR(500) NULL,
    `mangaCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `chapterCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `totalSize` BIGINT UNSIGNED NULL,
    `payload` MEDIUMTEXT NULL,
    `fetchTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniquePeerShareManifest`(`p2pGroupId`, `ownerNodeId`, `shareType`, `remoteMediaId`, `remoteMangaId`),
    INDEX `idxPeerShareManifestUpdate`(`p2pGroupId`, `updateTime`),
    PRIMARY KEY (`p2pPeerShareManifestId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tracker_share_manifest`
  ADD CONSTRAINT `tracker_share_manifest_trackerGroupId_fkey`
  FOREIGN KEY (`trackerGroupId`) REFERENCES `tracker_group`(`trackerGroupId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_peer_share_manifest`
  ADD CONSTRAINT `p2p_peer_share_manifest_p2pGroupId_fkey`
  FOREIGN KEY (`p2pGroupId`) REFERENCES `p2p_group`(`p2pGroupId`) ON DELETE RESTRICT ON UPDATE CASCADE;