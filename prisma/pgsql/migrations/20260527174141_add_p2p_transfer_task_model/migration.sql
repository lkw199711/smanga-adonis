-- CreateTable
CREATE TABLE "p2p_transfer_task" (
    "id" SERIAL NOT NULL,
    "transfer_id" INTEGER NOT NULL,
    "parent_key" TEXT,
    "task_key" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "queue_job_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "p2p_transfer_task_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "p2p_transfer_task_transfer_id_fkey"
        FOREIGN KEY ("transfer_id") REFERENCES "p2p_transfer"("p2pTransferId")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "p2p_transfer_task_transfer_id_status_idx" ON "p2p_transfer_task"("transfer_id", "status");

-- CreateIndex
CREATE INDEX "p2p_transfer_task_queue_job_id_idx" ON "p2p_transfer_task"("queue_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "p2p_transfer_task_transfer_id_task_key_key" ON "p2p_transfer_task"("transfer_id", "task_key");
