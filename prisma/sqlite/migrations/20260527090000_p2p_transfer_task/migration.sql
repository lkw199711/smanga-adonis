CREATE TABLE "p2p_transfer_task" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "transfer_id" INTEGER NOT NULL,
  "parent_key" TEXT NULL,
  "task_key" TEXT NOT NULL,
  "task_type" TEXT NOT NULL,
  "queue_job_id" INTEGER NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "error_message" TEXT NULL,
  "started_at" DATETIME NULL,
  "finished_at" DATETIME NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "p2p_transfer_task_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "p2p_transfer" ("p2pTransferId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "p2p_transfer_task_transfer_task_key" ON "p2p_transfer_task"("transfer_id", "task_key");
CREATE INDEX "p2p_transfer_task_transfer_status" ON "p2p_transfer_task"("transfer_id", "status");
CREATE INDEX "p2p_transfer_task_queue_job_id" ON "p2p_transfer_task"("queue_job_id");
