CREATE TABLE `p2p_transfer_task` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `transfer_id` INT UNSIGNED NOT NULL,
  `parent_key` VARCHAR(255) NULL,
  `task_key` VARCHAR(255) NOT NULL,
  `task_type` VARCHAR(64) NOT NULL,
  `queue_job_id` INT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `error_message` TEXT NULL,
  `started_at` DATETIME(6) NULL,
  `finished_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  CONSTRAINT `p2p_transfer_task_transfer_id_fkey`
    FOREIGN KEY (`transfer_id`) REFERENCES `p2p_transfer`(`p2pTransferId`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `p2p_transfer_task_transfer_task_key` ON `p2p_transfer_task`(`transfer_id`, `task_key`);
CREATE INDEX `p2p_transfer_task_transfer_status` ON `p2p_transfer_task`(`transfer_id`, `status`);
CREATE INDEX `p2p_transfer_task_queue_job_id` ON `p2p_transfer_task`(`queue_job_id`);
