-- CreateTable
CREATE TABLE "storageRoot" (
    "storageRootId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rootKey" TEXT NOT NULL,
    "rootName" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL DEFAULT 'custom',
    "iconKey" TEXT NOT NULL DEFAULT 'storage-folder',
    "rootPath" TEXT NOT NULL,
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "lastCheckStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastCheckTime" DATETIME,
    "lastCheckMessage" TEXT,
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "path" ADD COLUMN "storageRootId" INTEGER REFERENCES "storageRoot"("storageRootId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "uniqueStorageRootKey" ON "storageRoot"("rootKey");
CREATE INDEX "storageRootDeleteFlag" ON "storageRoot"("deleteFlag");
CREATE INDEX "pathStorageRoot" ON "path"("storageRootId");
