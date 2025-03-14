/*
  Warnings:

  - A unique constraint covering the columns `[mangaId,userId]` on the table `latest` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `uniqueMangaUser` ON `latest`(`mangaId`, `userId`);

-- AddForeignKey
ALTER TABLE `latest` ADD CONSTRAINT `latest_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;
