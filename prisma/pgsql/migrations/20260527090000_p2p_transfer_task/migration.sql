CREATE TABLE "p2p_transfer_task" (
  "id" SERIAL NOT NULL,
  "transfer_id" INTEGER NOT NULL,
  "parent_key" VARCHAR(255),
  "task_key" VARCHAR(255) NOT NULL,
  "task_type" VARCHAR(64) NOT NULL,
  "queue_job_id" INTEGER,
  "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "error_message" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "p2p_transfer_task_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "p2p_transfer_task"
  ADD CONSTRAINT "p2p_transfer_task_transfer_id_fkey"
  FOREIGN KEY ("transfer_id") REFERENCES "p2p_transfer"("p2pTransferId")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "p2p_transfer_task_transfer_task_key" ON "p2p_transfer_task"("transfer_id", "task_key");
CREATE INDEX "p2p_transfer_task_transfer_status" ON "p2p_transfer_task"("transfer_id", "status");
CREATE INDEX "p2p_transfer_task_queue_job_id" ON "p2p_transfer_task"("queue_job_id");
