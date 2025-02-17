-- CreateTable
CREATE TABLE `bookmark` (
    `bookmarkId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `mediaId` INTEGER UNSIGNED NOT NULL,
    `mangaId` INTEGER UNSIGNED NOT NULL,
    `chapterId` INTEGER UNSIGNED NOT NULL,
    `userId` INTEGER UNSIGNED NOT NULL,
    `browseType` VARCHAR(191) NOT NULL DEFAULT 'flow',
    `page` INTEGER UNSIGNED NOT NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `pageImage` VARCHAR(191) NULL,

    UNIQUE INDEX `opage`(`chapterId`, `page`),
    PRIMARY KEY (`bookmarkId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chapter` (
    `chapterId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `mangaId` INTEGER UNSIGNED NOT NULL,
    `mediaId` INTEGER UNSIGNED NOT NULL,
    `pathId` INTEGER UNSIGNED NOT NULL,
    `browseType` VARCHAR(191) NOT NULL DEFAULT 'flow',
    `subTitle` VARCHAR(191) NULL,
    `picNum` INTEGER UNSIGNED NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `chapterName` VARCHAR(191) NOT NULL,
    `chapterPath` VARCHAR(191) NOT NULL,
    `chapterType` VARCHAR(191) NOT NULL DEFAULT 'image',
    `chapterCover` VARCHAR(191) NULL,
    `chapterNumber` VARCHAR(191) NULL,
    `deleteFlag` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `oname`(`mangaId`, `chapterName`),
    PRIMARY KEY (`chapterId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `collect` (
    `collectId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `collectType` VARCHAR(191) NOT NULL DEFAULT 'manga',
    `userId` INTEGER UNSIGNED NOT NULL,
    `mediaId` INTEGER UNSIGNED NOT NULL,
    `mangaId` INTEGER UNSIGNED NOT NULL,
    `mangaName` VARCHAR(191) NULL,
    `chapterId` INTEGER UNSIGNED NULL,
    `chapterName` VARCHAR(191) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueMangaChapter`(`userId`, `collectType`, `mangaId`, `chapterId`),
    PRIMARY KEY (`collectId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compress` (
    `compressId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `compressType` VARCHAR(191) NOT NULL,
    `compressPath` VARCHAR(191) NOT NULL,
    `compressStatus` VARCHAR(191) NULL,
    `imageCount` INTEGER UNSIGNED NULL,
    `mediaId` INTEGER UNSIGNED NOT NULL,
    `mangaId` INTEGER UNSIGNED NOT NULL,
    `chapterId` INTEGER UNSIGNED NOT NULL,
    `chapterPath` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `id`(`compressId`),
    UNIQUE INDEX `uniqueChapter`(`chapterId`),
    PRIMARY KEY (`compressId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `history` (
    `historyId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `userId` INTEGER UNSIGNED NOT NULL,
    `mediaId` INTEGER UNSIGNED NOT NULL,
    `mangaId` INTEGER UNSIGNED NOT NULL,
    `mangaName` VARCHAR(191) NULL,
    `chapterId` INTEGER UNSIGNED NOT NULL,
    `chapterName` VARCHAR(191) NULL,
    `chapterPath` VARCHAR(191) NULL,
    `browseType` VARCHAR(191) NOT NULL DEFAULT 'flow',
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (`historyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `latest` (
    `latestId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `page` INTEGER UNSIGNED NOT NULL,
    `finish` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `mangaId` INTEGER UNSIGNED NOT NULL,
    `chapterId` INTEGER UNSIGNED NOT NULL,
    `userId` INTEGER UNSIGNED NOT NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueMangaUser`(`mangaId`, `userId`),
    PRIMARY KEY (`latestId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `log` (
    `logId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `logType` VARCHAR(191) NOT NULL DEFAULT 'process',
    `logLevel` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `module` VARCHAR(191) NULL,
    `queue` VARCHAR(191) NULL,
    `message` VARCHAR(191) NOT NULL,
    `exception` TEXT NULL,
    `version` TEXT NOT NULL,
    `environment` TEXT NOT NULL,
    `context` JSON NULL,
    `device` JSON NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `userId` INTEGER UNSIGNED NULL,

    PRIMARY KEY (`logId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `login` (
    `loginId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `userId` INTEGER UNSIGNED NULL,
    `userName` VARCHAR(191) NULL,
    `nickName` VARCHAR(191) NULL,
    `request` INTEGER UNSIGNED NOT NULL,
    `ip` VARCHAR(191) NOT NULL,
    `userAgent` JSON NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `token` VARCHAR(191) NULL,

    PRIMARY KEY (`loginId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `manga` (
    `mangaId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `mediaId` INTEGER UNSIGNED NOT NULL,
    `pathId` INTEGER UNSIGNED NOT NULL,
    `mangaName` VARCHAR(191) NOT NULL,
    `mangaPath` VARCHAR(191) NOT NULL,
    `parentPath` VARCHAR(191) NULL,
    `mangaCover` VARCHAR(191) NULL,
    `mangaNumber` VARCHAR(191) NULL,
    `chapterCount` INTEGER UNSIGNED NULL,
    `browseType` VARCHAR(191) NOT NULL DEFAULT 'flow',
    `direction` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `removeFirst` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `title` VARCHAR(191) NULL,
    `subTitle` VARCHAR(191) NULL,
    `author` VARCHAR(191) NULL,
    `describe` VARCHAR(191) NULL,
    `publishDate` DATE NULL,
    `deleteFlag` INTEGER NOT NULL DEFAULT 0,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `oname`(`mediaId`, `mangaPath`),
    PRIMARY KEY (`mangaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mangaTag` (
    `mangaTagId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `mangaId` INTEGER UNSIGNED NOT NULL,
    `tagId` INTEGER UNSIGNED NOT NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `mangaTag`(`mangaId`, `tagId`),
    PRIMARY KEY (`mangaTagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media` (
    `mediaId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `mediaName` VARCHAR(191) NOT NULL,
    `mediaType` INTEGER UNSIGNED NOT NULL,
    `mediaRating` VARCHAR(191) NOT NULL DEFAULT 'child',
    `mediaCover` VARCHAR(191) NULL,
    `directoryFormat` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `browseType` VARCHAR(191) NOT NULL DEFAULT 'flow',
    `direction` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `removeFirst` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `deleteFlag` INTEGER NOT NULL DEFAULT 0,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueMedianame`(`mediaName`),
    PRIMARY KEY (`mediaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mediaPermisson` (
    `mediaPermissonId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `userId` INTEGER UNSIGNED NOT NULL,
    `mediaId` INTEGER UNSIGNED NOT NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `userMedia`(`userId`, `mediaId`),
    PRIMARY KEY (`mediaPermissonId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meta` (
    `metaId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `metaName` VARCHAR(191) NOT NULL,
    `mangaId` INTEGER UNSIGNED NOT NULL,
    `metaFile` VARCHAR(191) NULL,
    `metaContent` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (`metaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `path` (
    `pathId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `mediaId` INTEGER UNSIGNED NOT NULL,
    `pathType` VARCHAR(191) NULL,
    `autoScan` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `include` VARCHAR(191) NULL,
    `exclude` VARCHAR(191) NULL,
    `lastScanTime` DATETIME(0) NULL,
    `deleteFlag` INTEGER NOT NULL DEFAULT 0,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `pathContent` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `opath`(`mediaId`, `pathContent`),
    PRIMARY KEY (`pathId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scan` (
    `scanId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `scanStatus` VARCHAR(191) NOT NULL,
    `targetPath` VARCHAR(191) NULL,
    `pathId` INTEGER UNSIGNED NOT NULL,
    `scanCount` INTEGER UNSIGNED NULL,
    `scanIndex` INTEGER NULL DEFAULT 0,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `pathContent` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `uniquePath`(`pathId`),
    PRIMARY KEY (`scanId`, `pathId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tag` (
    `tagId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `tagName` VARCHAR(191) NOT NULL,
    `tagColor` VARCHAR(191) NOT NULL DEFAULT '#a0d911',
    `userId` INTEGER UNSIGNED NULL,
    `description` VARCHAR(191) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (`tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task` (
    `taskId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `taskName` VARCHAR(191) NOT NULL DEFAULT '',
    `command` TEXT NOT NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `args` JSON NULL,
    `startTime` TIMESTAMP(0) NULL,
    `endTime` TIMESTAMP(0) NULL,
    `error` TEXT NULL,
    `priority` INTEGER NOT NULL DEFAULT 10,

    PRIMARY KEY (`taskId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `taskFailed` (
    `taskId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `taskName` VARCHAR(191) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL,
    `command` TEXT NOT NULL,
    `args` JSON NULL,
    `startTime` TIMESTAMP(0) NULL,
    `endTime` TIMESTAMP(0) NULL,
    `error` TEXT NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (`taskId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `taskSuccess` (
    `taskId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `taskName` VARCHAR(191) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL,
    `command` TEXT NOT NULL,
    `args` JSON NULL,
    `startTime` TIMESTAMP(0) NULL,
    `endTime` TIMESTAMP(0) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (`taskId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `token` (
    `tokenId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `userId` INTEGER UNSIGNED NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(0) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (`tokenId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `userId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `userName` VARCHAR(191) NOT NULL,
    `passWord` CHAR(32) NOT NULL,
    `nickName` VARCHAR(191) NULL,
    `header` VARCHAR(191) NULL,
    `role` VARCHAR(191) NULL DEFAULT 'user',
    `mediaPermit` VARCHAR(191) NULL DEFAULT 'limit',
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `userConfig` JSON NULL,

    UNIQUE INDEX `uniqueUsername`(`userName`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `userPermisson` (
    `userPermissonId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `userId` INTEGER UNSIGNED NOT NULL,
    `module` VARCHAR(100) NOT NULL,
    `operation` VARCHAR(100) NOT NULL DEFAULT 'default',
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `userModuleOperation`(`userId`, `module`, `operation`),
    PRIMARY KEY (`userPermissonId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `version` (
    `versionId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `version` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueVersion`(`version`),
    PRIMARY KEY (`versionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bookmark` ADD CONSTRAINT `bookmark_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookmark` ADD CONSTRAINT `bookmark_chapterId_fkey` FOREIGN KEY (`chapterId`) REFERENCES `chapter`(`chapterId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chapter` ADD CONSTRAINT `chapter_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chapter` ADD CONSTRAINT `chapter_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media`(`mediaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collect` ADD CONSTRAINT `collect_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`userId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collect` ADD CONSTRAINT `collect_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collect` ADD CONSTRAINT `collect_chapterId_fkey` FOREIGN KEY (`chapterId`) REFERENCES `chapter`(`chapterId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compress` ADD CONSTRAINT `compress_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compress` ADD CONSTRAINT `compress_chapterId_fkey` FOREIGN KEY (`chapterId`) REFERENCES `chapter`(`chapterId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `history` ADD CONSTRAINT `history_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`userId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `history` ADD CONSTRAINT `history_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `history` ADD CONSTRAINT `history_chapterId_fkey` FOREIGN KEY (`chapterId`) REFERENCES `chapter`(`chapterId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `latest` ADD CONSTRAINT `latest_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `login` ADD CONSTRAINT `login_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`userId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `manga` ADD CONSTRAINT `manga_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media`(`mediaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `manga` ADD CONSTRAINT `manga_pathId_fkey` FOREIGN KEY (`pathId`) REFERENCES `path`(`pathId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mangaTag` ADD CONSTRAINT `mangaTag_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mangaTag` ADD CONSTRAINT `mangaTag_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `tag`(`tagId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mediaPermisson` ADD CONSTRAINT `mediaPermisson_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`userId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mediaPermisson` ADD CONSTRAINT `mediaPermisson_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media`(`mediaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meta` ADD CONSTRAINT `meta_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `path` ADD CONSTRAINT `path_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media`(`mediaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `token` ADD CONSTRAINT `token_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`userId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userPermisson` ADD CONSTRAINT `userPermisson_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`userId`) ON DELETE RESTRICT ON UPDATE CASCADE;
