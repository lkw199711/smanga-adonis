-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_latest" (
    "latestId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "page" INTEGER NOT NULL,
    "finish" INTEGER NOT NULL DEFAULT 0,
    "mangaId" INTEGER NOT NULL,
    "chapterId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "latest_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga" ("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "latest_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapter" ("chapterId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_latest" ("chapterId", "createTime", "finish", "latestId", "mangaId", "page", "updateTime", "userId") SELECT "chapterId", "createTime", "finish", "latestId", "mangaId", "page", "updateTime", "userId" FROM "latest";
DROP TABLE "latest";
ALTER TABLE "new_latest" RENAME TO "latest";
CREATE UNIQUE INDEX "uniqueChapterUser" ON "latest"("chapterId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
