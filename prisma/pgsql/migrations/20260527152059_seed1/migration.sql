/*
  Warnings:

  - You are about to drop the `p2p_transfer_task` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "p2p_transfer_task" DROP CONSTRAINT "p2p_transfer_task_transfer_id_fkey";

-- DropIndex
DROP INDEX "uniqueGroupShare";

-- AlterTable
ALTER TABLE "p2p_local_share" ADD COLUMN     "remoteMangaId" INTEGER,
ADD COLUMN     "remoteMediaId" INTEGER,
ADD COLUMN     "sharePath" TEXT;

-- DropTable
DROP TABLE "p2p_transfer_task";

-- CreateIndex
CREATE INDEX "idxP2PLocalShareGroupType" ON "p2p_local_share"("p2pGroupId", "shareType");
