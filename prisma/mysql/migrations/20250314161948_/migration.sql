/*
  Warnings:

  - A unique constraint covering the columns `[chapterId,userId]` on the table `latest` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `latest` DROP FOREIGN KEY `latest_mangaId_fkey`;

-- DropIndex
DROP INDEX `uniqueMangaUser` ON `latest`;

-- AlterTable
ALTER TABLE `latest` ADD COLUMN `count` INTEGER UNSIGNED NULL;

-- CreateIndex
CREATE UNIQUE INDEX `uniqueChapterUser` ON `latest`(`chapterId`, `userId`);

-- AddForeignKey
ALTER TABLE `latest` ADD CONSTRAINT `latest_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `latest` ADD CONSTRAINT `latest_chapterId_fkey` FOREIGN KEY (`chapterId`) REFERENCES `chapter`(`chapterId`) ON DELETE RESTRICT ON UPDATE CASCADE;
