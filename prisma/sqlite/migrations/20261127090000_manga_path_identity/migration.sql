CREATE INDEX "mangaMediaId" ON "manga"("mediaId");
CREATE UNIQUE INDEX "uniqueMangaPath" ON "manga"("pathId", "mangaPath");
DROP INDEX "unique-name";
