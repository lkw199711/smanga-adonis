-- Preserve legacy scan history for the post-migration importer.
RENAME TABLE
  `scan` TO `legacy_scan`,
  `task` TO `legacy_task`,
  `taskFailed` TO `legacy_task_failed`,
  `taskSuccess` TO `legacy_task_success`;
