-- DropIndex
DROP INDEX `collect_mangaId_fkey` ON `collect`;

-- DropIndex
DROP INDEX `history_chapterId_fkey` ON `history`;

-- DropIndex
DROP INDEX `history_mangaId_fkey` ON `history`;

-- DropIndex
DROP INDEX `login_userId_fkey` ON `login`;

-- DropIndex
DROP INDEX `token_userId_fkey` ON `token`;

-- AddForeignKey
ALTER TABLE `bookmark` ADD CONSTRAINT `bookmark_chapterId_fkey` FOREIGN KEY (`chapterId`) REFERENCES `chapter`(`chapterId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chapter` ADD CONSTRAINT `chapter_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collect` ADD CONSTRAINT `collect_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compress` ADD CONSTRAINT `compress_chapterId_fkey` FOREIGN KEY (`chapterId`) REFERENCES `chapter`(`chapterId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `history` ADD CONSTRAINT `history_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `history` ADD CONSTRAINT `history_chapterId_fkey` FOREIGN KEY (`chapterId`) REFERENCES `chapter`(`chapterId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `latest` ADD CONSTRAINT `latest_mangaId_fkey` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`mangaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `login` ADD CONSTRAINT `login_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`userId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `manga` ADD CONSTRAINT `manga_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media`(`mediaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `path` ADD CONSTRAINT `path_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media`(`mediaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `token` ADD CONSTRAINT `token_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`userId`) ON DELETE RESTRICT ON UPDATE CASCADE;
