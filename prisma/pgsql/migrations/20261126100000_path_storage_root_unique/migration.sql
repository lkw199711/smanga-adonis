DROP INDEX "opath";
CREATE UNIQUE INDEX "opath" ON "path"("mediaId", "storageRootId", "pathContent");
