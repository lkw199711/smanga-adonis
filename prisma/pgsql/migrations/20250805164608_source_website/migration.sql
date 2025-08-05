-- AlterTable
ALTER TABLE "media" ADD COLUMN     "sourceWebsite" TEXT;

-- CreateTable
CREATE TABLE "share" (
    "shareId" SERIAL NOT NULL,
    "shareType" VARCHAR(191) NOT NULL DEFAULT 'manga',
    "source" VARCHAR(191) NOT NULL,
    "userId" INTEGER,
    "mediaId" INTEGER NOT NULL,
    "mangaId" INTEGER,
    "link" VARCHAR(191) NOT NULL,
    "secret" VARCHAR(191) NOT NULL,
    "expires" TIMESTAMP(3),
    "enable" INTEGER NOT NULL DEFAULT 1,
    "whiteList" VARCHAR(191),
    "blackList" VARCHAR(191),
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_pkey" PRIMARY KEY ("shareId")
);

-- CreateTable
CREATE TABLE "sync" (
    "syncId" SERIAL NOT NULL,
    "syncType" VARCHAR(191) NOT NULL DEFAULT 'manga',
    "source" VARCHAR(191) NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "userId" INTEGER,
    "shareId" INTEGER NOT NULL,
    "link" VARCHAR(191) NOT NULL,
    "secret" VARCHAR(191) NOT NULL,
    "auto" INTEGER NOT NULL DEFAULT 0,
    "token" VARCHAR(191),
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_pkey" PRIMARY KEY ("syncId")
);
