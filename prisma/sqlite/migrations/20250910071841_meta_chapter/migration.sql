-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_meta" (
    "metaId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "metaName" TEXT NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "chapterId" INTEGER,
    "metaFile" TEXT,
    "metaContent" TEXT,
    "description" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meta_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga" ("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "meta_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapter" ("chapterId") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_meta" ("createTime", "description", "mangaId", "metaContent", "metaFile", "metaId", "metaName", "updateTime") SELECT "createTime", "description", "mangaId", "metaContent", "metaFile", "metaId", "metaName", "updateTime" FROM "meta";
DROP TABLE "meta";
ALTER TABLE "new_meta" RENAME TO "meta";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
