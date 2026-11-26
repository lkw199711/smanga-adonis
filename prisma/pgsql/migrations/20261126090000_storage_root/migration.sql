-- CreateTable
CREATE TABLE "storageRoot" (
    "storageRootId" SERIAL NOT NULL,
    "rootKey" TEXT NOT NULL,
    "rootName" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL DEFAULT 'custom',
    "iconKey" TEXT NOT NULL DEFAULT 'storage-folder',
    "rootPath" TEXT NOT NULL,
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "lastCheckStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastCheckTime" TIMESTAMP(3),
    "lastCheckMessage" TEXT,
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storageRoot_pkey" PRIMARY KEY ("storageRootId")
);

-- AlterTable
ALTER TABLE "path" ADD COLUMN "storageRootId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "uniqueStorageRootKey" ON "storageRoot"("rootKey");
CREATE INDEX "storageRootDeleteFlag" ON "storageRoot"("deleteFlag");
CREATE INDEX "pathStorageRoot" ON "path"("storageRootId");

-- AddForeignKey
ALTER TABLE "path" ADD CONSTRAINT "path_storageRootId_fkey" FOREIGN KEY ("storageRootId") REFERENCES "storageRoot"("storageRootId") ON DELETE RESTRICT ON UPDATE CASCADE;
