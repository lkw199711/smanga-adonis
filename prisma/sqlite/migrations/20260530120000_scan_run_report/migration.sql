-- CreateTable
CREATE TABLE "scanRun" (
    "scanRunId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runType" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mediaId" INTEGER,
    "pathId" INTEGER,
    "pathContent" TEXT,
    "configSnapshot" TEXT,
    "summaryJson" TEXT,
    "message" TEXT,
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "scanRunItem" (
    "scanRunItemId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scanRunId" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "action" TEXT,
    "reasonCode" TEXT,
    "reason" TEXT,
    "targetName" TEXT,
    "targetPath" TEXT,
    "extraJson" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "scanRunMedia" ON "scanRun"("mediaId");

-- CreateIndex
CREATE INDEX "scanRunPath" ON "scanRun"("pathId");

-- CreateIndex
CREATE INDEX "scanRunStatus" ON "scanRun"("status");

-- CreateIndex
CREATE INDEX "scanRunCreateTime" ON "scanRun"("createTime");

-- CreateIndex
CREATE INDEX "scanRunItemRun" ON "scanRunItem"("scanRunId");

-- CreateIndex
CREATE INDEX "scanRunItemLevel" ON "scanRunItem"("level");

-- CreateIndex
CREATE INDEX "scanRunItemReason" ON "scanRunItem"("reasonCode");
