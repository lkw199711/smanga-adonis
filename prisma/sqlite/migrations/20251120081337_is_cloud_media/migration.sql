-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_media" (
    "mediaId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaName" TEXT NOT NULL,
    "mediaType" INTEGER NOT NULL,
    "mediaRating" TEXT NOT NULL DEFAULT 'child',
    "mediaCover" TEXT,
    "sourceWebsite" TEXT,
    "isCloudMedia" INTEGER NOT NULL DEFAULT 0,
    "directoryFormat" INTEGER NOT NULL DEFAULT 0,
    "browseType" TEXT NOT NULL DEFAULT 'flow',
    "direction" INTEGER NOT NULL DEFAULT 1,
    "removeFirst" INTEGER NOT NULL DEFAULT 0,
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_media" ("browseType", "createTime", "deleteFlag", "direction", "directoryFormat", "mediaCover", "mediaId", "mediaName", "mediaRating", "mediaType", "removeFirst", "sourceWebsite", "updateTime") SELECT "browseType", "createTime", "deleteFlag", "direction", "directoryFormat", "mediaCover", "mediaId", "mediaName", "mediaRating", "mediaType", "removeFirst", "sourceWebsite", "updateTime" FROM "media";
DROP TABLE "media";
ALTER TABLE "new_media" RENAME TO "media";
CREATE UNIQUE INDEX "uniqueMedianame" ON "media"("mediaName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
