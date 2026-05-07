-- P2P publicHost + publicPort 合并为 publicUrl
-- 迁移数据: 旧 host+port 拼接为 "http://host:port" 写入新字段
-- SQLite 不支持 DROP COLUMN(旧版本),使用 Prisma 标准的"重建表"策略
PRAGMA foreign_keys=OFF;

-- ============ tracker_node ============
CREATE TABLE "new_tracker_node" (
    "trackerNodeId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nodeId" TEXT NOT NULL,
    "nodeToken" TEXT NOT NULL,
    "nodeName" TEXT,
    "publicUrl" TEXT,
    "localHost" TEXT,
    "localPort" INTEGER,
    "version" TEXT,
    "userAgent" TEXT,
    "online" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeat" DATETIME,
    "totalUpload" BIGINT NOT NULL DEFAULT 0,
    "totalDownload" BIGINT NOT NULL DEFAULT 0,
    "banned" INTEGER NOT NULL DEFAULT 0,
    "bannedReason" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_tracker_node" ("trackerNodeId","nodeId","nodeToken","nodeName","publicUrl","localHost","localPort","version","userAgent","online","lastHeartbeat","totalUpload","totalDownload","banned","bannedReason","createTime","updateTime")
SELECT "trackerNodeId","nodeId","nodeToken","nodeName",
       CASE
         WHEN "publicHost" IS NOT NULL AND "publicHost" <> '' AND "publicPort" IS NOT NULL AND "publicPort" > 0
           THEN 'http://' || "publicHost" || ':' || "publicPort"
         WHEN "publicHost" IS NOT NULL AND "publicHost" <> ''
           THEN 'http://' || "publicHost"
         ELSE NULL
       END,
       "localHost","localPort","version","userAgent","online","lastHeartbeat","totalUpload","totalDownload","banned","bannedReason","createTime","updateTime"
FROM "tracker_node";
DROP TABLE "tracker_node";
ALTER TABLE "new_tracker_node" RENAME TO "tracker_node";
CREATE UNIQUE INDEX "uniqueTrackerNodeId" ON "tracker_node"("nodeId");

-- ============ p2p_peer_cache ============
CREATE TABLE "new_p2p_peer_cache" (
    "p2pPeerCacheId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "p2pGroupId" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeName" TEXT,
    "publicUrl" TEXT,
    "localHost" TEXT,
    "localPort" INTEGER,
    "online" INTEGER NOT NULL DEFAULT 0,
    "version" TEXT,
    "lastSeen" DATETIME,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "p2p_peer_cache_p2pGroupId_fkey" FOREIGN KEY ("p2pGroupId") REFERENCES "p2p_group" ("p2pGroupId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_p2p_peer_cache" ("p2pPeerCacheId","p2pGroupId","nodeId","nodeName","publicUrl","localHost","localPort","online","version","lastSeen","createTime","updateTime")
SELECT "p2pPeerCacheId","p2pGroupId","nodeId","nodeName",
       CASE
         WHEN "publicHost" IS NOT NULL AND "publicHost" <> '' AND "publicPort" IS NOT NULL AND "publicPort" > 0
           THEN 'http://' || "publicHost" || ':' || "publicPort"
         WHEN "publicHost" IS NOT NULL AND "publicHost" <> ''
           THEN 'http://' || "publicHost"
         ELSE NULL
       END,
       "localHost","localPort","online","version","lastSeen","createTime","updateTime"
FROM "p2p_peer_cache";
DROP TABLE "p2p_peer_cache";
ALTER TABLE "new_p2p_peer_cache" RENAME TO "p2p_peer_cache";
CREATE UNIQUE INDEX "uniqueGroupNode" ON "p2p_peer_cache"("p2pGroupId", "nodeId");

PRAGMA foreign_keys=ON;