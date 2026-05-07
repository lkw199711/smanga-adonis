-- P2P publicHost + publicPort 合并为 publicUrl
-- 步骤:
--   1. 新增 publicUrl 列
--   2. 回填数据: 'http://host:port' 或 'http://host'
--   3. 删除旧列

-- ============ tracker_node ============
ALTER TABLE `tracker_node` ADD COLUMN `publicUrl` VARCHAR(255) NULL;
UPDATE `tracker_node`
SET `publicUrl` = CASE
    WHEN `publicHost` IS NOT NULL AND `publicHost` <> '' AND `publicPort` IS NOT NULL AND `publicPort` > 0
      THEN CONCAT('http://', `publicHost`, ':', `publicPort`)
    WHEN `publicHost` IS NOT NULL AND `publicHost` <> ''
      THEN CONCAT('http://', `publicHost`)
    ELSE NULL
  END;
ALTER TABLE `tracker_node` DROP COLUMN `publicHost`;
ALTER TABLE `tracker_node` DROP COLUMN `publicPort`;

-- ============ p2p_peer_cache ============
ALTER TABLE `p2p_peer_cache` ADD COLUMN `publicUrl` VARCHAR(255) NULL;
UPDATE `p2p_peer_cache`
SET `publicUrl` = CASE
    WHEN `publicHost` IS NOT NULL AND `publicHost` <> '' AND `publicPort` IS NOT NULL AND `publicPort` > 0
      THEN CONCAT('http://', `publicHost`, ':', `publicPort`)
    WHEN `publicHost` IS NOT NULL AND `publicHost` <> ''
      THEN CONCAT('http://', `publicHost`)
    ELSE NULL
  END;
ALTER TABLE `p2p_peer_cache` DROP COLUMN `publicHost`;
ALTER TABLE `p2p_peer_cache` DROP COLUMN `publicPort`;