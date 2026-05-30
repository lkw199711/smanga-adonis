-- CreateTable
CREATE TABLE `scanRun` (
    `scanRunId` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `runType` VARCHAR(32) NOT NULL,
    `triggerType` VARCHAR(32) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `mediaId` INT UNSIGNED NULL,
    `pathId` INT UNSIGNED NULL,
    `pathContent` TEXT NULL,
    `configSnapshot` TEXT NULL,
    `summaryJson` TEXT NULL,
    `message` TEXT NULL,
    `error` TEXT NULL,
    `startedAt` DATETIME(6) NULL,
    `finishedAt` DATETIME(6) NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`scanRunId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scanRunItem` (
    `scanRunItemId` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `scanRunId` INT UNSIGNED NOT NULL,
    `level` VARCHAR(32) NOT NULL,
    `category` VARCHAR(32) NOT NULL,
    `targetType` VARCHAR(32) NOT NULL,
    `action` VARCHAR(32) NULL,
    `reasonCode` VARCHAR(64) NULL,
    `reason` TEXT NULL,
    `targetName` VARCHAR(255) NULL,
    `targetPath` TEXT NULL,
    `extraJson` TEXT NULL,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`scanRunItemId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `scanRunMedia` ON `scanRun`(`mediaId`);

-- CreateIndex
CREATE INDEX `scanRunPath` ON `scanRun`(`pathId`);

-- CreateIndex
CREATE INDEX `scanRunStatus` ON `scanRun`(`status`);

-- CreateIndex
CREATE INDEX `scanRunCreateTime` ON `scanRun`(`createTime`);

-- CreateIndex
CREATE INDEX `scanRunItemRun` ON `scanRunItem`(`scanRunId`);

-- CreateIndex
CREATE INDEX `scanRunItemLevel` ON `scanRunItem`(`level`);

-- CreateIndex
CREATE INDEX `scanRunItemReason` ON `scanRunItem`(`reasonCode`);
