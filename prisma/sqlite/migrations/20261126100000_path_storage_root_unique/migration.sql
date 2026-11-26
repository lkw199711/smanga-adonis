-- Make a relative path unique within its storage root rather than globally within the media library.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_path" (
    "pathId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaId" INTEGER NOT NULL,
    "storageRootId" INTEGER,
    "pathType" TEXT,
    "autoScan" INTEGER NOT NULL DEFAULT 0,
    "include" TEXT,
    "exclude" TEXT,
    "scanTemplateKey" TEXT,
    "scanTemplateConfig" TEXT,
    "metadataProfileKey" TEXT,
    "metadataProfileConfig" TEXT,
    "lastScanTime" DATETIME,
    "deleteFlag" INTEGER NOT NULL DEFAULT 0,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pathContent" TEXT NOT NULL,
    CONSTRAINT "path_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media" ("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "path_storageRootId_fkey" FOREIGN KEY ("storageRootId") REFERENCES "storageRoot" ("storageRootId") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_path" ("pathId", "mediaId", "storageRootId", "pathType", "autoScan", "include", "exclude", "scanTemplateKey", "scanTemplateConfig", "metadataProfileKey", "metadataProfileConfig", "lastScanTime", "deleteFlag", "createTime", "updateTime", "pathContent")
SELECT "pathId", "mediaId", "storageRootId", "pathType", "autoScan", "include", "exclude", "scanTemplateKey", "scanTemplateConfig", "metadataProfileKey", "metadataProfileConfig", "lastScanTime", "deleteFlag", "createTime", "updateTime", "pathContent" FROM "path";

DROP TABLE "path";
ALTER TABLE "new_path" RENAME TO "path";
CREATE UNIQUE INDEX "opath" ON "path"("mediaId", "storageRootId", "pathContent");
CREATE INDEX "pathStorageRoot" ON "path"("storageRootId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
