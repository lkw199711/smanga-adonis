CREATE TABLE `queue_jobs` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `queue_name` VARCHAR(191) NOT NULL,
  `task_queue` VARCHAR(191) NOT NULL,
  `task_name` VARCHAR(191) NOT NULL,
  `command` TEXT NOT NULL,
  `args` JSON NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `priority` INTEGER NOT NULL DEFAULT 10,
  `attempts_made` INTEGER NOT NULL DEFAULT 0,
  `max_attempts` INTEGER NOT NULL DEFAULT 3,
  `timeout_ms` INTEGER NOT NULL DEFAULT 120000,
  `available_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `locked_by` VARCHAR(191) NULL,
  `locked_until` DATETIME(6) NULL,
  `started_at` DATETIME(6) NULL,
  `last_error` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `queue_failed_jobs` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `original_job_id` INTEGER UNSIGNED NOT NULL,
  `queue_name` VARCHAR(191) NOT NULL,
  `task_queue` VARCHAR(191) NOT NULL,
  `task_name` VARCHAR(191) NOT NULL,
  `command` TEXT NOT NULL,
  `args` JSON NULL,
  `attempts_made` INTEGER NOT NULL DEFAULT 0,
  `max_attempts` INTEGER NOT NULL DEFAULT 3,
  `error` TEXT NULL,
  `failed_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `queue_workers` (
  `worker_id` VARCHAR(191) NOT NULL,
  `worker_group` VARCHAR(191) NOT NULL,
  `mode` VARCHAR(191) NOT NULL,
  `queues` JSON NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'running',
  `started_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `heartbeat_at` DATETIME(6) NULL,
  `stopped_at` DATETIME(6) NULL,
  `metadata` JSON NULL,
  PRIMARY KEY (`worker_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `idx_queue_jobs_claim` ON `queue_jobs`(`queue_name`, `task_queue`, `status`, `available_at`, `priority`, `id`);
CREATE INDEX `idx_queue_jobs_stalled` ON `queue_jobs`(`status`, `locked_until`);
CREATE INDEX `idx_queue_jobs_task_status` ON `queue_jobs`(`task_name`, `status`);
CREATE INDEX `idx_queue_jobs_locked_by` ON `queue_jobs`(`locked_by`);
CREATE INDEX `idx_queue_failed_jobs_queue` ON `queue_failed_jobs`(`queue_name`, `task_queue`, `failed_at`);
CREATE INDEX `idx_queue_failed_jobs_original` ON `queue_failed_jobs`(`original_job_id`);
CREATE INDEX `idx_queue_workers_group_status` ON `queue_workers`(`worker_group`, `status`);
CREATE INDEX `idx_queue_workers_heartbeat` ON `queue_workers`(`heartbeat_at`);
