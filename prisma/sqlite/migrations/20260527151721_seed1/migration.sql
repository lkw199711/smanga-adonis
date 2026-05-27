/*
  Warnings:

  - You are about to drop the `p2p_transfer_task` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "uniqueGroupShare";

-- DropIndex
DROP INDEX "p2p_transfer_task_queue_job_id";

-- DropIndex
DROP INDEX "p2p_transfer_task_transfer_status";

-- DropIndex
DROP INDEX "p2p_transfer_task_transfer_task_key";

-- AlterTable
ALTER TABLE "p2p_local_share" ADD COLUMN "remoteMangaId" INTEGER;
ALTER TABLE "p2p_local_share" ADD COLUMN "remoteMediaId" INTEGER;
ALTER TABLE "p2p_local_share" ADD COLUMN "sharePath" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "p2p_transfer_task";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_p2p_transfer" (
    "p2pTransferId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "p2pGroupId" INTEGER NOT NULL,
    "groupNo" TEXT NOT NULL DEFAULT '',
    "peerNodeId" TEXT NOT NULL DEFAULT '',
    "transferType" TEXT NOT NULL,
    "remoteMediaId" INTEGER,
    "remoteMangaId" INTEGER,
    "remoteChapterId" INTEGER,
    "remoteName" TEXT NOT NULL,
    "receivedPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" BIGINT,
    "downloadedBytes" BIGINT NOT NULL DEFAULT 0,
    "speedBps" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "connectMode" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startTime" DATETIME,
    "endTime" DATETIME,
    CONSTRAINT "p2p_transfer_p2pGroupId_fkey" FOREIGN KEY ("p2pGroupId") REFERENCES "p2p_group" ("p2pGroupId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_p2p_transfer" ("connectMode", "createTime", "downloadedBytes", "endTime", "error", "groupNo", "p2pGroupId", "p2pTransferId", "peerNodeId", "progress", "receivedPath", "remoteChapterId", "remoteMangaId", "remoteMediaId", "remoteName", "speedBps", "startTime", "status", "totalBytes", "transferType", "updateTime") SELECT "connectMode", "createTime", "downloadedBytes", "endTime", "error", "groupNo", "p2pGroupId", "p2pTransferId", "peerNodeId", "progress", "receivedPath", "remoteChapterId", "remoteMangaId", "remoteMediaId", "remoteName", "speedBps", "startTime", "status", "totalBytes", "transferType", "updateTime" FROM "p2p_transfer";
DROP TABLE "p2p_transfer";
ALTER TABLE "new_p2p_transfer" RENAME TO "p2p_transfer";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "idxP2PLocalShareGroupType" ON "p2p_local_share"("p2pGroupId", "shareType");

-- RedefineIndex
DROP INDEX "idxPeerShareManifestUpdate";
CREATE INDEX "p2p_peer_share_manifest_p2pGroupId_updateTime_idx" ON "p2p_peer_share_manifest"("p2pGroupId", "updateTime");

-- RedefineIndex
DROP INDEX "idxShareManifestUpdate";
CREATE INDEX "tracker_share_manifest_trackerGroupId_updateTime_idx" ON "tracker_share_manifest"("trackerGroupId", "updateTime");
