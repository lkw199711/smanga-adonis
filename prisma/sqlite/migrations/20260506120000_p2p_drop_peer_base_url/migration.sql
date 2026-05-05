-- DropColumn: 移除 p2p_transfer.peerBaseUrl
-- 现在拉取任务采用多源策略:运行时从 Tracker 查询资源的所有持有节点
-- 作为候选源,并由 P2P 成员缓存 (p2p_peer_cache) 解析出每个候选的 base url,
-- 不再需要在 transfer 记录中固化单一对端地址。
ALTER TABLE "p2p_transfer" DROP COLUMN "peerBaseUrl";