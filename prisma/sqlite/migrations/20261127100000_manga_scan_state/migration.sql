CREATE TABLE "mangaScanState" (
    "mangaId" INTEGER NOT NULL PRIMARY KEY,
    "scanKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "templatePattern" TEXT,
    "chapterCount" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "checkedAt" DATETIME NOT NULL,
    CONSTRAINT "mangaScanState_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga" ("mangaId") ON DELETE CASCADE ON UPDATE CASCADE
);
