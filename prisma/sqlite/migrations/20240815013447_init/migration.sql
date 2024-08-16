-- CreateTable
CREATE TABLE "bookmark" (
    "bookmarkId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaId" INTEGER NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "chapterId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "browseType" TEXT NOT NULL DEFAULT 'flow',
    "page" INTEGER NOT NULL,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pageImage" TEXT,
    CONSTRAINT "bookmark_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga" ("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bookmark_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapter" ("chapterId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "chapter" (
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

-- CreateTable
CREATE TABLE "collect" (
    "collectId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "collectType" TEXT NOT NULL DEFAULT 'manga',
    "userId" INTEGER NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "mangaName" TEXT,
    "chapterId" INTEGER,
    "chapterName" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collect_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "collect_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga" ("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "collect_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapter" ("chapterId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "compress" (
    "compressId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "compressType" TEXT NOT NULL,
    "compressPath" TEXT NOT NULL,
    "compressStatus" TEXT,
    "imageCount" INTEGER,
    "mediaId" INTEGER NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "chapterId" INTEGER NOT NULL,
    "chapterPath" TEXT NOT NULL,
    "userId" INTEGER,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "compress_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga" ("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "compress_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapter" ("chapterId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "history" (
    "historyId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "mangaName" TEXT,
    "chapterId" INTEGER NOT NULL,
    "chapterName" TEXT,
    "chapterPath" TEXT,
    "browseType" TEXT NOT NULL DEFAULT 'flow',
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "history_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga" ("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "history_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapter" ("chapterId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "latest" (
    "latestId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "page" INTEGER NOT NULL,
    "finish" INTEGER NOT NULL DEFAULT 0,
    "mangaId" INTEGER NOT NULL,
    "chapterId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "latest_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga" ("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "log" (
    "logId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "logType" TEXT NOT NULL DEFAULT 'process',
    "logLevel" INTEGER NOT NULL DEFAULT 0,
    "module" TEXT,
    "queue" TEXT,
    "message" TEXT NOT NULL,
    "exception" TEXT,
    "version" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "context" TEXT,
    "device" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER
);

-- CreateTable
CREATE TABLE "login" (
    "loginId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "userName" TEXT,
    "nickName" TEXT,
    "request" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token" TEXT,
    CONSTRAINT "login_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("userId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "manga" (
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

-- CreateTable
CREATE TABLE "mangaTag" (
    "mangaTagId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mangaId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mangaTag_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga" ("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "mangaTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag" ("tagId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "media" (
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

-- CreateTable
CREATE TABLE "mediaPermisson" (
    "mediaPermissonId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mediaPermisson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "mediaPermisson_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media" ("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "meta" (
    "metaId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "metaName" TEXT NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "metaFile" TEXT,
    "metaContent" TEXT,
    "description" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meta_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga" ("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "path" (
    "pathId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaId" INTEGER NOT NULL,
    "pathType" TEXT,
    "autoScan" INTEGER NOT NULL DEFAULT 0,
    "include" TEXT,
    "exclude" TEXT,
    "lastScanTime" DATETIME,
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pathContent" TEXT NOT NULL,
    CONSTRAINT "path_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media" ("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scan" (
    "scanId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scanStatus" TEXT NOT NULL,
    "targetPath" TEXT,
    "pathId" INTEGER NOT NULL,
    "scanCount" INTEGER,
    "scanIndex" INTEGER DEFAULT 0,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pathContent" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "tag" (
    "tagId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tagName" TEXT NOT NULL,
    "tagColor" TEXT NOT NULL DEFAULT '#a0d911',
    "userId" INTEGER,
    "description" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "task" (
    "taskId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskName" TEXT NOT NULL DEFAULT '',
    "command" TEXT NOT NULL,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "args" TEXT,
    "startTime" DATETIME,
    "endTime" DATETIME,
    "error" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 10
);

-- CreateTable
CREATE TABLE "taskFailed" (
    "taskId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "args" TEXT,
    "startTime" DATETIME,
    "endTime" DATETIME,
    "error" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "taskSuccess" (
    "taskId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "args" TEXT,
    "startTime" DATETIME,
    "endTime" DATETIME,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "token" (
    "tokenId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user" (
    "userId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userName" TEXT NOT NULL,
    "passWord" TEXT NOT NULL,
    "nickName" TEXT,
    "header" TEXT,
    "role" TEXT,
    "mediaPermit" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userConfig" TEXT
);

-- CreateTable
CREATE TABLE "userPermisson" (
    "userPermissonId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "module" TEXT NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'default',
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "userPermisson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "version" (
    "versionId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "opage" ON "bookmark"("chapterId", "page");

-- CreateIndex
CREATE UNIQUE INDEX "oname" ON "chapter"("mangaId", "chapterName");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueMangaChapter" ON "collect"("userId", "collectType", "mangaId", "chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "id" ON "compress"("compressId");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueChapter" ON "compress"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueMangaUser" ON "latest"("mangaId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "unique-name" ON "manga"("mediaId", "mangaPath");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueMangaTag" ON "mangaTag"("mangaId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueMedianame" ON "media"("mediaName");

-- CreateIndex
CREATE UNIQUE INDEX "userMedia" ON "mediaPermisson"("userId", "mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "opath" ON "path"("mediaId", "pathContent");

-- CreateIndex
CREATE UNIQUE INDEX "uniquePath" ON "scan"("pathId");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueUsername" ON "user"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "userModuleOperation" ON "userPermisson"("userId", "module", "operation");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueVersion" ON "version"("version");
