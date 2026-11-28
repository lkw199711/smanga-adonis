import { randomUUID } from 'node:crypto'
import {
  checkedMigrationRoots,
  finishDirectoryMigration,
  planDirectoryCopies,
  type DirectoryMigrationInput,
} from './directory_migration_service.js'
import {
  getDirectoryCopyState,
  publishDirectoryCopies,
  saveDirectoryMigrationCheckpoint,
  type QueueJobAttempt,
} from './queue/sql_queue_repository.js'

export default class DirectoryMigrationJob {
  constructor(private args: DirectoryMigrationInput & {
    copyRunId?: string
    directoryCount?: number
    sourceCleanupStarted?: boolean
  }) {}

  async run(attempt?: QueueJobAttempt) {
    if (!attempt) throw new Error('迁移主任务必须从数据库队列执行')

    if (!this.args.sourceCleanupStarted) {
      if (!this.args.copyRunId) {
        const { source, target } = await checkedMigrationRoots(this.args)
        const directories = await planDirectoryCopies(source)
        await publishDirectoryCopies(attempt, {
          ...this.args,
          sourcePath: source,
          targetPath: target,
          copyRunId: randomUUID(),
          directoryCount: directories.length,
        }, directories)
        return 'deferred' as const
      }

      const copies = await getDirectoryCopyState(this.args.copyRunId)
      if (copies.active > 0) {
        return 'deferred' as const
      }
      if (copies.failed) {
        throw new Error(`目录复制失败（${copies.failed.relativePath || '源目录根层'}）：${copies.failed.error}`)
      }
    }

    const stats = await finishDirectoryMigration(this.args, {
      started: this.args.sourceCleanupStarted === true,
      save: () => saveDirectoryMigrationCheckpoint(attempt, { ...this.args, sourceCleanupStarted: true }),
    })
    console.log(
      `[directory-migration] completed ${this.args.sourcePath} -> ${this.args.targetPath}`,
      {
        directories: this.args.directoryCount,
        deletedFiles: stats.deletedFiles,
        deletedDirectories: stats.deletedDirectories,
        deletedSourceFiles: stats.deletedSourceFiles,
      }
    )
  }
}
