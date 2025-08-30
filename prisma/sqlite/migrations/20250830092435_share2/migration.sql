-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_share" (
    "shareId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shareType" TEXT NOT NULL DEFAULT 'manga',
    "shareName" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "userId" INTEGER,
    "mediaId" INTEGER NOT NULL,
    "mangaId" INTEGER,
    "link" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "expires" DATETIME,
    "enable" INTEGER NOT NULL DEFAULT 1,
    "whiteList" TEXT,
    "blackList" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "share_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("userId") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "share_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media" ("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "share_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga" ("mangaId") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_share" ("blackList", "createTime", "enable", "expires", "link", "mangaId", "mediaId", "origin", "secret", "shareId", "shareName", "shareType", "updateTime", "userId", "whiteList") SELECT "blackList", "createTime", "enable", "expires", "link", "mangaId", "mediaId", "origin", "secret", "shareId", "shareName", "shareType", "updateTime", "userId", "whiteList" FROM "share";
DROP TABLE "share";
ALTER TABLE "new_share" RENAME TO "share";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
