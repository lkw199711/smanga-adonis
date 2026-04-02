/*
  Warnings:

  - Made the column `chapterCount` on table `manga` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "manga" ADD COLUMN     "chapterUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "chapterCount" SET NOT NULL,
ALTER COLUMN "chapterCount" SET DEFAULT 0;
