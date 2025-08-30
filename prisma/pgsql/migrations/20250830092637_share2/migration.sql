-- AddForeignKey
ALTER TABLE "share" ADD CONSTRAINT "share_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share" ADD CONSTRAINT "share_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share" ADD CONSTRAINT "share_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga"("mangaId") ON DELETE SET NULL ON UPDATE CASCADE;
