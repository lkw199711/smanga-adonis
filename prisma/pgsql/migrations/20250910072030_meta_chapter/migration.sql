-- AlterTable
ALTER TABLE "meta" ADD COLUMN     "chapterId" INTEGER;

-- AddForeignKey
ALTER TABLE "meta" ADD CONSTRAINT "meta_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapter"("chapterId") ON DELETE SET NULL ON UPDATE CASCADE;
