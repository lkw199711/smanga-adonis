-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_chapter" (
    "chapterId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mangaId" INTEGER NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "pathId" INTEGER NOT NULL,
    "browseType" TEXT NOT NULL DEFAULT 'flow',
    "subTitle" TEXT,
    "picNum" INTEGER,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chapterName" TEXT NOT NULL,
    "chapterPath" TEXT NOT NULL,
    "chapterType" TEXT NOT NULL DEFAULT 'image',
    "chapterCover" TEXT,
    "chapterNumber" TEXT,
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "chapter_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga" ("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "chapter_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media" ("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_chapter" ("browseType", "chapterCover", "chapterId", "chapterName", "chapterNumber", "chapterPath", "chapterType", "createTime", "mangaId", "mediaId", "pathId", "picNum", "subTitle", "updateTime") SELECT "browseType", "chapterCover", "chapterId", "chapterName", "chapterNumber", "chapterPath", "chapterType", "createTime", "mangaId", "mediaId", "pathId", "picNum", "subTitle", "updateTime" FROM "chapter";
DROP TABLE "chapter";
ALTER TABLE "new_chapter" RENAME TO "chapter";
CREATE UNIQUE INDEX "oname" ON "chapter"("mangaId", "chapterName");
CREATE TABLE "new_manga" (
    "mangaId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaId" INTEGER NOT NULL,
    "pathId" INTEGER NOT NULL,
    "mangaName" TEXT NOT NULL,
    "mangaPath" TEXT NOT NULL,
    "parentPath" TEXT,
    "mangaCover" TEXT,
    "mangaNumber" TEXT,
    "chapterCount" INTEGER,
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
    CONSTRAINT "manga_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media" ("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "manga_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "path" ("pathId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_manga" ("author", "browseType", "chapterCount", "createTime", "describe", "direction", "mangaCover", "mangaId", "mangaName", "mangaNumber", "mangaPath", "mediaId", "parentPath", "pathId", "publishDate", "removeFirst", "subTitle", "title", "updateTime") SELECT "author", "browseType", "chapterCount", "createTime", "describe", "direction", "mangaCover", "mangaId", "mangaName", "mangaNumber", "mangaPath", "mediaId", "parentPath", "pathId", "publishDate", "removeFirst", "subTitle", "title", "updateTime" FROM "manga";
DROP TABLE "manga";
ALTER TABLE "new_manga" RENAME TO "manga";
CREATE UNIQUE INDEX "unique-name" ON "manga"("mediaId", "mangaPath");
CREATE TABLE "new_media" (
    "mediaId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaName" TEXT NOT NULL,
    "mediaType" INTEGER NOT NULL,
    "mediaRating" TEXT NOT NULL DEFAULT 'child',
    "mediaCover" TEXT,
    "directoryFormat" INTEGER NOT NULL DEFAULT 0,
    "browseType" TEXT NOT NULL DEFAULT 'flow',
    "direction" INTEGER NOT NULL DEFAULT 1,
    "removeFirst" INTEGER NOT NULL DEFAULT 0,
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_media" ("browseType", "createTime", "direction", "directoryFormat", "mediaCover", "mediaId", "mediaName", "mediaRating", "mediaType", "removeFirst", "updateTime") SELECT "browseType", "createTime", "direction", "directoryFormat", "mediaCover", "mediaId", "mediaName", "mediaRating", "mediaType", "removeFirst", "updateTime" FROM "media";
DROP TABLE "media";
ALTER TABLE "new_media" RENAME TO "media";
CREATE UNIQUE INDEX "uniqueMedianame" ON "media"("mediaName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
