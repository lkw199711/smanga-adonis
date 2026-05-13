/*
  Warnings:

  - A unique constraint covering the columns `[userId,chapterId,page]` on the table `bookmark` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `bookmark` DROP FOREIGN KEY `bookmark_chapterId_fkey`;

-- DropForeignKey
ALTER TABLE `bookmark` DROP FOREIGN KEY `bookmark_mangaId_fkey`;

-- DropIndex
DROP INDEX `opage` ON `bookmark`;

-- CreateIndex
CREATE UNIQUE INDEX `opage` ON `bookmark`(`userId`, `chapterId`, `page`);

-- AddForeignKey
ALTER TABLE `bookmark` ADD CONSTRAINT `bookmark_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookmark` ADD CONSTRAINT `bookmark_chapterId_fkey` FOREIGN KEY (`chapterId`) REFERENCES `chapter`(`chapterId`) ON DELETE RESTRICT ON UPDATE CASCADE;
