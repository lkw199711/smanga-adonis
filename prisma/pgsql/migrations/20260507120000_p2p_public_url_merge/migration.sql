-- P2P publicHost + publicPort 合并为 publicUrl

-- ============ tracker_node ============
ALTER TABLE "tracker_node" ADD COLUMN "publicUrl" TEXT;
UPDATE "tracker_node"
SET "publicUrl" = CASE
    WHEN "publicHost" IS NOT NULL AND "publicHost" <> '' AND "publicPort" IS NOT NULL AND "publicPort" > 0
      THEN 'http://' || "publicHost" || ':' || "publicPort"
    WHEN "publicHost" IS NOT NULL AND "publicHost" <> ''
      THEN 'http://' || "publicHost"
    ELSE NULL
  END;
ALTER TABLE "tracker_node" DROP COLUMN "publicHost";
ALTER TABLE "tracker_node" DROP COLUMN "publicPort";

-- ============ p2p_peer_cache ============
ALTER TABLE "p2p_peer_cache" ADD COLUMN "publicUrl" TEXT;
UPDATE "p2p_peer_cache"
SET "publicUrl" = CASE
    WHEN "publicHost" IS NOT NULL AND "publicHost" <> '' AND "publicPort" IS NOT NULL AND "publicPort" > 0
      THEN 'http://' || "publicHost" || ':' || "publicPort"
    WHEN "publicHost" IS NOT NULL AND "publicHost" <> ''
      THEN 'http://' || "publicHost"
    ELSE NULL
  END;
ALTER TABLE "p2p_peer_cache" DROP COLUMN "publicHost";
ALTER TABLE "p2p_peer_cache" DROP COLUMN "publicPort";