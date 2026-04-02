/*
  Warnings:

  - Made the column `chapterCount` on table `manga` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `manga` ADD COLUMN `chapterUpdate` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    MODIFY `chapterCount` INTEGER UNSIGNED NOT NULL DEFAULT 0;
