-- CreateTable
CREATE TABLE "scanRun" (
    "scanRunId" SERIAL NOT NULL,
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
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanRun_pkey" PRIMARY KEY ("scanRunId")
);

-- CreateTable
CREATE TABLE "scanRunItem" (
    "scanRunItemId" SERIAL NOT NULL,
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
    "createTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanRunItem_pkey" PRIMARY KEY ("scanRunItemId")
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
