CREATE TABLE "queue_jobs" (
  "id" SERIAL NOT NULL,
  "queue_name" TEXT NOT NULL,
  "task_queue" TEXT NOT NULL,
  "task_name" TEXT NOT NULL,
  "command" TEXT NOT NULL,
  "args" JSONB NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "priority" INTEGER NOT NULL DEFAULT 10,
  "attempts_made" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "timeout_ms" INTEGER NOT NULL DEFAULT 120000,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_by" TEXT NULL,
  "locked_until" TIMESTAMP(3) NULL,
  "started_at" TIMESTAMP(3) NULL,
  "last_error" TEXT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "queue_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "queue_failed_jobs" (
  "id" SERIAL NOT NULL,
  "original_job_id" INTEGER NOT NULL,
  "queue_name" TEXT NOT NULL,
  "task_queue" TEXT NOT NULL,
  "task_name" TEXT NOT NULL,
  "command" TEXT NOT NULL,
  "args" JSONB NULL,
  "attempts_made" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "error" TEXT NULL,
  "failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "queue_failed_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "queue_workers" (
  "worker_id" TEXT NOT NULL,
  "worker_group" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "queues" JSONB NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heartbeat_at" TIMESTAMP(3) NULL,
  "stopped_at" TIMESTAMP(3) NULL,
  "metadata" JSONB NULL,
  CONSTRAINT "queue_workers_pkey" PRIMARY KEY ("worker_id")
);

CREATE INDEX "idx_queue_jobs_claim" ON "queue_jobs"("queue_name", "task_queue", "status", "available_at", "priority", "id");
CREATE INDEX "idx_queue_jobs_stalled" ON "queue_jobs"("status", "locked_until");
CREATE INDEX "idx_queue_jobs_task_status" ON "queue_jobs"("task_name", "status");
CREATE INDEX "idx_queue_jobs_locked_by" ON "queue_jobs"("locked_by");
CREATE INDEX "idx_queue_failed_jobs_queue" ON "queue_failed_jobs"("queue_name", "task_queue", "failed_at");
CREATE INDEX "idx_queue_failed_jobs_original" ON "queue_failed_jobs"("original_job_id");
CREATE INDEX "idx_queue_workers_group_status" ON "queue_workers"("worker_group", "status");
CREATE INDEX "idx_queue_workers_heartbeat" ON "queue_workers"("heartbeat_at");
