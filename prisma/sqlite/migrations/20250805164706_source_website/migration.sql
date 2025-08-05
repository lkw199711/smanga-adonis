-- AlterTable
ALTER TABLE "media" ADD COLUMN "sourceWebsite" TEXT;

-- CreateTable
CREATE TABLE "share" (
    "shareId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shareType" TEXT NOT NULL DEFAULT 'manga',
    "source" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "sync" (
    "syncId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "syncType" TEXT NOT NULL DEFAULT 'manga',
    "source" TEXT NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "userId" INTEGER,
    "shareId" INTEGER NOT NULL,
    "link" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "auto" INTEGER NOT NULL DEFAULT 0,
    "token" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
