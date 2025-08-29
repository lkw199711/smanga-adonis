/*
  Warnings:

  - You are about to drop the column `source` on the `share` table. All the data in the column will be lost.
  - You are about to drop the column `mediaId` on the `sync` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `sync` table. All the data in the column will be lost.
  - Added the required column `origin` to the `share` table without a default value. This is not possible if the table is not empty.
  - Added the required column `origin` to the `sync` table without a default value. This is not possible if the table is not empty.
  - Added the required column `receivedPath` to the `sync` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `sync` DROP FOREIGN KEY `sync_mediaId_fkey`;

-- DropIndex
DROP INDEX `sync_mediaId_fkey` ON `sync`;

-- AlterTable
ALTER TABLE `share` DROP COLUMN `source`,
    ADD COLUMN `origin` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `sync` DROP COLUMN `mediaId`,
    DROP COLUMN `source`,
    ADD COLUMN `origin` VARCHAR(191) NOT NULL,
    ADD COLUMN `receivedPath` VARCHAR(191) NOT NULL;
