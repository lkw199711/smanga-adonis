-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_path" (
    "pathId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaId" INTEGER NOT NULL,
    "pathType" TEXT,
    "autoScan" INTEGER NOT NULL DEFAULT 0,
    "include" TEXT,
    "exclude" TEXT,
    "lastScanTime" DATETIME,
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pathContent" TEXT NOT NULL,
    CONSTRAINT "path_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media" ("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_path" ("autoScan", "createTime", "exclude", "include", "lastScanTime", "mediaId", "pathContent", "pathId", "pathType", "updateTime") SELECT "autoScan", "createTime", "exclude", "include", "lastScanTime", "mediaId", "pathContent", "pathId", "pathType", "updateTime" FROM "path";
DROP TABLE "path";
ALTER TABLE "new_path" RENAME TO "path";
CREATE UNIQUE INDEX "opath" ON "path"("mediaId", "pathContent");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
