-- logging indexes
ALTER TABLE "log" ALTER COLUMN "message" TYPE TEXT;

CREATE INDEX IF NOT EXISTS "idx_log_create_time" ON "log"("createTime");
CREATE INDEX IF NOT EXISTS "idx_log_level_create_time" ON "log"("logLevel", "createTime");
CREATE INDEX IF NOT EXISTS "idx_log_type_create_time" ON "log"("logType", "createTime");
CREATE INDEX IF NOT EXISTS "idx_log_module_create_time" ON "log"("module", "createTime");
CREATE INDEX IF NOT EXISTS "idx_log_user_create_time" ON "log"("userId", "createTime");
CREATE INDEX IF NOT EXISTS "idx_log_queue_create_time" ON "log"("queue", "createTime");