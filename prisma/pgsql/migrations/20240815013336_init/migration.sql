-- CreateTable
CREATE TABLE "bookmark" (
    "bookmarkId" SERIAL NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "chapterId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "browseType" TEXT NOT NULL DEFAULT 'flow',
    "page" INTEGER NOT NULL,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pageImage" TEXT,

    CONSTRAINT "bookmark_pkey" PRIMARY KEY ("bookmarkId")
);

-- CreateTable
CREATE TABLE "chapter" (
    "chapterId" SERIAL NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "pathId" INTEGER NOT NULL,
    "browseType" TEXT NOT NULL DEFAULT 'flow',
    "subTitle" TEXT,
    "picNum" INTEGER,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chapterName" TEXT NOT NULL,
    "chapterPath" TEXT NOT NULL,
    "chapterType" TEXT NOT NULL DEFAULT 'image',
    "chapterCover" TEXT,
    "chapterNumber" TEXT,
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chapter_pkey" PRIMARY KEY ("chapterId")
);

-- CreateTable
CREATE TABLE "collect" (
    "collectId" SERIAL NOT NULL,
    "collectType" TEXT NOT NULL DEFAULT 'manga',
    "userId" INTEGER NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "mangaName" TEXT,
    "chapterId" INTEGER,
    "chapterName" TEXT,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collect_pkey" PRIMARY KEY ("collectId")
);

-- CreateTable
CREATE TABLE "compress" (
    "compressId" SERIAL NOT NULL,
    "compressType" TEXT NOT NULL,
    "compressPath" TEXT NOT NULL,
    "compressStatus" TEXT,
    "imageCount" INTEGER,
    "mediaId" INTEGER NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "chapterId" INTEGER NOT NULL,
    "chapterPath" TEXT NOT NULL,
    "userId" INTEGER,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compress_pkey" PRIMARY KEY ("compressId")
);

-- CreateTable
CREATE TABLE "history" (
    "historyId" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "mangaName" TEXT,
    "chapterId" INTEGER NOT NULL,
    "chapterName" TEXT,
    "chapterPath" TEXT,
    "browseType" TEXT NOT NULL DEFAULT 'flow',
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "history_pkey" PRIMARY KEY ("historyId")
);

-- CreateTable
CREATE TABLE "latest" (
    "latestId" SERIAL NOT NULL,
    "page" INTEGER NOT NULL,
    "finish" INTEGER NOT NULL DEFAULT 0,
    "mangaId" INTEGER NOT NULL,
    "chapterId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "latest_pkey" PRIMARY KEY ("latestId")
);

-- CreateTable
CREATE TABLE "log" (
    "logId" SERIAL NOT NULL,
    "logType" TEXT NOT NULL DEFAULT 'process',
    "logLevel" INTEGER NOT NULL DEFAULT 0,
    "module" TEXT,
    "queue" TEXT,
    "message" TEXT NOT NULL,
    "exception" TEXT,
    "version" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "context" JSONB,
    "device" JSONB,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,

    CONSTRAINT "log_pkey" PRIMARY KEY ("logId")
);

-- CreateTable
CREATE TABLE "login" (
    "loginId" SERIAL NOT NULL,
    "userId" INTEGER,
    "userName" TEXT,
    "nickName" TEXT,
    "request" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" JSONB,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token" TEXT,

    CONSTRAINT "login_pkey" PRIMARY KEY ("loginId")
);

-- CreateTable
CREATE TABLE "manga" (
    "mangaId" SERIAL NOT NULL,
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
    "publishDate" DATE,
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manga_pkey" PRIMARY KEY ("mangaId")
);

-- CreateTable
CREATE TABLE "mangaTag" (
    "mangaTagId" SERIAL NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mangaTag_pkey" PRIMARY KEY ("mangaTagId")
);

-- CreateTable
CREATE TABLE "media" (
    "mediaId" SERIAL NOT NULL,
    "mediaName" TEXT NOT NULL,
    "mediaType" INTEGER NOT NULL,
    "mediaRating" TEXT NOT NULL DEFAULT 'child',
    "mediaCover" TEXT,
    "directoryFormat" INTEGER NOT NULL DEFAULT 0,
    "browseType" TEXT NOT NULL DEFAULT 'flow',
    "direction" INTEGER NOT NULL DEFAULT 1,
    "removeFirst" INTEGER NOT NULL DEFAULT 0,
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("mediaId")
);

-- CreateTable
CREATE TABLE "mediaPermisson" (
    "mediaPermissonId" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mediaPermisson_pkey" PRIMARY KEY ("mediaPermissonId")
);

-- CreateTable
CREATE TABLE "meta" (
    "metaId" SERIAL NOT NULL,
    "metaName" TEXT NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "metaFile" TEXT,
    "metaContent" TEXT,
    "description" TEXT,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_pkey" PRIMARY KEY ("metaId")
);

-- CreateTable
CREATE TABLE "path" (
    "pathId" SERIAL NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "pathType" TEXT,
    "autoScan" INTEGER NOT NULL DEFAULT 0,
    "include" TEXT,
    "exclude" TEXT,
    "lastScanTime" TIMESTAMP(3),
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pathContent" TEXT NOT NULL,

    CONSTRAINT "path_pkey" PRIMARY KEY ("pathId")
);

-- CreateTable
CREATE TABLE "scan" (
    "scanId" SERIAL NOT NULL,
    "scanStatus" TEXT NOT NULL,
    "targetPath" TEXT,
    "pathId" INTEGER NOT NULL,
    "scanCount" INTEGER,
    "scanIndex" INTEGER DEFAULT 0,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pathContent" TEXT NOT NULL,

    CONSTRAINT "scan_pkey" PRIMARY KEY ("scanId","pathId")
);

-- CreateTable
CREATE TABLE "tag" (
    "tagId" SERIAL NOT NULL,
    "tagName" TEXT NOT NULL,
    "tagColor" TEXT NOT NULL DEFAULT '#a0d911',
    "userId" INTEGER,
    "description" TEXT,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("tagId")
);

-- CreateTable
CREATE TABLE "task" (
    "taskId" SERIAL NOT NULL,
    "taskName" TEXT NOT NULL DEFAULT '',
    "command" TEXT NOT NULL,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "args" JSONB,
    "startTime" TIMESTAMP(0),
    "endTime" TIMESTAMP(0),
    "error" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "task_pkey" PRIMARY KEY ("taskId")
);

-- CreateTable
CREATE TABLE "taskFailed" (
    "taskId" SERIAL NOT NULL,
    "taskName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "args" JSONB,
    "startTime" TIMESTAMP(0),
    "endTime" TIMESTAMP(0),
    "error" TEXT,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taskFailed_pkey" PRIMARY KEY ("taskId")
);

-- CreateTable
CREATE TABLE "taskSuccess" (
    "taskId" SERIAL NOT NULL,
    "taskName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "args" JSONB,
    "startTime" TIMESTAMP(0),
    "endTime" TIMESTAMP(0),
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taskSuccess_pkey" PRIMARY KEY ("taskId")
);

-- CreateTable
CREATE TABLE "token" (
    "tokenId" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3),
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_pkey" PRIMARY KEY ("tokenId")
);

-- CreateTable
CREATE TABLE "user" (
    "userId" SERIAL NOT NULL,
    "userName" TEXT NOT NULL,
    "passWord" CHAR(32) NOT NULL,
    "nickName" TEXT,
    "header" TEXT,
    "role" TEXT,
    "mediaPermit" TEXT,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userConfig" JSONB,

    CONSTRAINT "user_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "userPermisson" (
    "userPermissonId" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "module" TEXT NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'default',
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "userPermisson_pkey" PRIMARY KEY ("userPermissonId")
);

-- CreateTable
CREATE TABLE "version" (
    "versionId" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "version_pkey" PRIMARY KEY ("versionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "opage" ON "bookmark"("chapterId", "page");

-- CreateIndex
CREATE UNIQUE INDEX "unique-name" ON "chapter"("mangaId", "chapterName");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueMangaChapter" ON "collect"("userId", "collectType", "mangaId", "chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "id" ON "compress"("compressId");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueChapter" ON "compress"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "uniqueMangaUser" ON "latest"("mangaId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "oname" ON "manga"("mediaId", "mangaPath");

-- CreateIndex
CREATE UNIQUE INDEX "unique-mangaTag" ON "mangaTag"("mangaId", "tagId");

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

-- AddForeignKey
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga"("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapter"("chapterId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga"("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect" ADD CONSTRAINT "collect_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect" ADD CONSTRAINT "collect_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga"("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect" ADD CONSTRAINT "collect_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapter"("chapterId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compress" ADD CONSTRAINT "compress_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga"("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compress" ADD CONSTRAINT "compress_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapter"("chapterId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history" ADD CONSTRAINT "history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history" ADD CONSTRAINT "history_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga"("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history" ADD CONSTRAINT "history_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapter"("chapterId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "latest" ADD CONSTRAINT "latest_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga"("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login" ADD CONSTRAINT "login_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manga" ADD CONSTRAINT "manga_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manga" ADD CONSTRAINT "manga_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "path"("pathId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mangaTag" ADD CONSTRAINT "mangaTag_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga"("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mangaTag" ADD CONSTRAINT "mangaTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag"("tagId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mediaPermisson" ADD CONSTRAINT "mediaPermisson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mediaPermisson" ADD CONSTRAINT "mediaPermisson_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta" ADD CONSTRAINT "meta_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "manga"("mangaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path" ADD CONSTRAINT "path_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token" ADD CONSTRAINT "token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userPermisson" ADD CONSTRAINT "userPermisson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
