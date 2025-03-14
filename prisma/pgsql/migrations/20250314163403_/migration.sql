/*
  Warnings:

  - A unique constraint covering the columns `[chapterId,userId]` on the table `latest` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "uniqueMangaUser";

-- CreateIndex
CREATE UNIQUE INDEX "uniqueChapterUser" ON "latest"("chapterId", "userId");

-- AddForeignKey
ALTER TABLE "latest" ADD CONSTRAINT "latest_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapter"("chapterId") ON DELETE RESTRICT ON UPDATE CASCADE;
