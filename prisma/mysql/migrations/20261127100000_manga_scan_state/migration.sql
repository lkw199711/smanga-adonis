CREATE TABLE `mangaScanState` (
    `mangaId` INTEGER UNSIGNED NOT NULL PRIMARY KEY,
    `scanKey` VARCHAR(64) NOT NULL,
    `fingerprint` VARCHAR(191) NOT NULL,
    `templatePattern` VARCHAR(191),
    `chapterCount` INTEGER NOT NULL,
    `score` INTEGER NOT NULL,
    `checkedAt` DATETIME(3) NOT NULL,
    CONSTRAINT `mangaScanState_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga` (`mangaId`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
