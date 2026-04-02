-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_manga" (
    "mangaId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaId" INTEGER NOT NULL,
    "pathId" INTEGER NOT NULL,
    "mangaName" TEXT NOT NULL,
    "mangaPath" TEXT NOT NULL,
    "parentPath" TEXT,
    "mangaCover" TEXT,
    "mangaNumber" TEXT,
    "chapterCount" INTEGER NOT NULL DEFAULT 0,
    "browseType" TEXT NOT NULL DEFAULT 'flow',
    "direction" INTEGER NOT NULL DEFAULT 1,
    "removeFirst" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "subTitle" TEXT,
    "author" TEXT,
    "describe" TEXT,
    "publishDate" DATETIME,
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chapterUpdate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "manga_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media" ("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "manga_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "path" ("pathId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_manga" ("author", "browseType", "chapterCount", "createTime", "deleteFlag", "describe", "direction", "mangaCover", "mangaId", "mangaName", "mangaNumber", "mangaPath", "mediaId", "parentPath", "pathId", "publishDate", "removeFirst", "subTitle", "title", "updateTime") SELECT "author", "browseType", coalesce("chapterCount", 0) AS "chapterCount", "createTime", "deleteFlag", "describe", "direction", "mangaCover", "mangaId", "mangaName", "mangaNumber", "mangaPath", "mediaId", "parentPath", "pathId", "publishDate", "removeFirst", "subTitle", "title", "updateTime" FROM "manga";
DROP TABLE "manga";
ALTER TABLE "new_manga" RENAME TO "manga";
CREATE UNIQUE INDEX "unique-name" ON "manga"("mediaId", "mangaPath");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
