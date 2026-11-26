-- CreateTable
CREATE TABLE `storageRoot` (
    `storageRootId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `rootKey` VARCHAR(64) NOT NULL,
    `rootName` VARCHAR(100) NOT NULL,
    `providerKey` VARCHAR(64) NOT NULL DEFAULT 'custom',
    `iconKey` VARCHAR(64) NOT NULL DEFAULT 'storage-folder',
    `rootPath` TEXT NOT NULL,
    `enabled` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `description` TEXT NULL,
    `lastCheckStatus` VARCHAR(32) NOT NULL DEFAULT 'unknown',
    `lastCheckTime` DATETIME(6) NULL,
    `lastCheckMessage` TEXT NULL,
    `deleteFlag` INTEGER NOT NULL DEFAULT 0,
    `createTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updateTime` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `uniqueStorageRootKey`(`rootKey`),
    INDEX `storageRootDeleteFlag`(`deleteFlag`),
    PRIMARY KEY (`storageRootId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `path` ADD COLUMN `storageRootId` INTEGER UNSIGNED NULL;
CREATE INDEX `pathStorageRoot` ON `path`(`storageRootId`);
ALTER TABLE `path` ADD CONSTRAINT `path_storageRootId_fkey` FOREIGN KEY (`storageRootId`) REFERENCES `storageRoot`(`storageRootId`) ON DELETE RESTRICT ON UPDATE CASCADE;
