/*
  Warnings:

  - You are about to drop the column `source` on the `share` table. All the data in the column will be lost.
  - You are about to drop the column `mediaId` on the `sync` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `sync` table. All the data in the column will be lost.
  - Added the required column `origin` to the `share` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shareName` to the `share` table without a default value. This is not possible if the table is not empty.
  - Added the required column `origin` to the `sync` table without a default value. This is not possible if the table is not empty.
  - Added the required column `receivedPath` to the `sync` table without a default value. This is not possible if the table is not empty.
  - Added the required column `syncName` to the `sync` table without a default value. This is not possible if the table is not empty.

*/
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
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_share" ("blackList", "createTime", "enable", "expires", "link", "mangaId", "mediaId", "secret", "shareId", "shareType", "updateTime", "userId", "whiteList") SELECT "blackList", "createTime", "enable", "expires", "link", "mangaId", "mediaId", "secret", "shareId", "shareType", "updateTime", "userId", "whiteList" FROM "share";
DROP TABLE "share";
ALTER TABLE "new_share" RENAME TO "share";
CREATE TABLE "new_sync" (
    "syncId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "syncType" TEXT NOT NULL DEFAULT 'manga',
    "syncName" TEXT NOT NULL,
    "receivedPath" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "userId" INTEGER,
    "shareId" INTEGER NOT NULL,
    "link" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "auto" INTEGER NOT NULL DEFAULT 0,
    "token" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_sync" ("auto", "createTime", "link", "secret", "shareId", "syncId", "syncType", "token", "updateTime", "userId") SELECT "auto", "createTime", "link", "secret", "shareId", "syncId", "syncType", "token", "updateTime", "userId" FROM "sync";
DROP TABLE "sync";
ALTER TABLE "new_sync" RENAME TO "sync";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
