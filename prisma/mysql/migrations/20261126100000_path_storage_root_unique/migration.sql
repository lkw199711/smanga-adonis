CREATE UNIQUE INDEX `pathMediaRootContent` ON `path`(`mediaId`, `storageRootId`, `pathContent`);
DROP INDEX `opath` ON `path`;
