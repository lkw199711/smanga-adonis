-- 删除 tracker_node / p2p_peer_cache 的 localHost / localPort 字段
-- 原因: publicUrl 已覆盖完整连接语义,localHost/localPort 无用且引发歧义

-- ============ tracker_node ============
ALTER TABLE "tracker_node" DROP COLUMN "localHost";
ALTER TABLE "tracker_node" DROP COLUMN "localPort";

-- ============ p2p_peer_cache ============
ALTER TABLE "p2p_peer_cache" DROP COLUMN "localHost";
ALTER TABLE "p2p_peer_cache" DROP COLUMN "localPort";