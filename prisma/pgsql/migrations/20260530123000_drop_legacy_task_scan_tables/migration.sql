-- Preserve legacy scan history for the post-migration importer.
ALTER TABLE "scan" RENAME TO "legacy_scan";
ALTER TABLE "task" RENAME TO "legacy_task";
ALTER TABLE "taskFailed" RENAME TO "legacy_task_failed";
ALTER TABLE "taskSuccess" RENAME TO "legacy_task_success";
