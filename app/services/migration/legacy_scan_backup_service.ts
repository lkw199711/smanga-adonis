import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { get_config, get_os } from '#utils/index'

const LEGACY_TABLES = ['scan', 'task', 'taskFailed', 'taskSuccess'] as const
type LegacyTable = (typeof LEGACY_TABLES)[number]
const PRESERVED_TABLES: Record<LegacyTable, string> = {
  scan: 'legacy_scan',
  task: 'legacy_task',
  taskFailed: 'legacy_task_failed',
  taskSuccess: 'legacy_task_success',
}
const MIGRATION_MARKER = 'legacy:migration:complete'

type LegacyBackup = {
  version: 1
  createdAt: string
  databaseClient: string
  rowCounts: Record<string, number>
  checksum: string
  tables: Partial<Record<LegacyTable, any[]>>
}

function backupDirectory() {
  return get_os() === 'Linux'
    ? path.join('/data', 'backups', 'legacy-scan')
    : path.resolve('data', 'backups', 'legacy-scan')
}

function serialize(value: unknown) {
  return JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item), 2)
}

async function existingTables(db: any, client: string): Promise<string[]> {
  const candidates = [...LEGACY_TABLES, ...Object.values(PRESERVED_TABLES)]
  if (client === 'mysql') {
    const rows = await db.$queryRawUnsafe(
      `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (${candidates.map(() => '?').join(',')})`,
      ...candidates
    )
    return rows.map((row: any) => row.name)
  }
  if (client === 'postgresql' || client === 'pgsql') {
    const names = candidates.map((name) => `'${name}'`).join(',')
    const rows = await db.$queryRawUnsafe(
      `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${names})`
    )
    return rows.map((row: any) => row.name)
  }
  const names = candidates.map((name) => `'${name}'`).join(',')
  const rows = await db.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${names})`
  )
  return rows.map((row: any) => row.name)
}

function quotedTable(table: string, client: string) {
  return client === 'mysql' ? `\`${table}\`` : `"${table}"`
}

export async function backupLegacyScanTables(db: any): Promise<string | null> {
  if (!db) return null
  const client = get_config()?.sql?.client || 'sqlite'
  const existing = await existingTables(db, client)
  if (!existing.length) return null

  const tables: LegacyBackup['tables'] = {}
  for (const table of LEGACY_TABLES) {
    const sourceTable = existing.includes(PRESERVED_TABLES[table])
      ? PRESERVED_TABLES[table]
      : existing.includes(table)
        ? table
        : null
    if (!sourceTable) continue
    tables[table] = await db.$queryRawUnsafe(`SELECT * FROM ${quotedTable(sourceTable, client)}`)
  }

  const dataJson = serialize(tables)
  const backup: LegacyBackup = {
    version: 1,
    createdAt: new Date().toISOString(),
    databaseClient: client,
    rowCounts: Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [name, rows?.length || 0])
    ),
    checksum: crypto.createHash('sha256').update(dataJson).digest('hex'),
    tables,
  }

  const dir = backupDirectory()
  await fs.promises.mkdir(dir, { recursive: true })
  const timestamp = backup.createdAt.replace(/[:.]/g, '-')
  const filePath = path.join(dir, `legacy-scan-${timestamp}.json`)
  await fs.promises.writeFile(filePath, serialize(backup), { encoding: 'utf8', flag: 'wx' })
  console.log(`[migration] legacy scan tables backed up to ${filePath}`)
  return filePath
}

function parseArgs(raw: unknown) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, any>
  try {
    return JSON.parse(String(raw)) as Record<string, any>
  } catch {
    return {}
  }
}

function legacyStatus(status: unknown, fallback: 'success' | 'failed') {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'pending' || normalized === 'waiting') return 'pending'
  if (normalized === 'running' || normalized === 'active') return 'running'
  if (normalized === 'failed' || normalized === 'error') return 'failed'
  if (normalized === 'success' || normalized === 'completed') return 'success'
  return fallback
}

export async function importLegacyScanHistory(db: any, backupFile?: string | null) {
  if (!db || !backupFile || !fs.existsSync(backupFile) || backupFile.endsWith('.imported.json'))
    return 0
  const backup = JSON.parse(await fs.promises.readFile(backupFile, 'utf8')) as LegacyBackup
  const dataJson = serialize(backup.tables)
  const checksum = crypto.createHash('sha256').update(dataJson).digest('hex')
  if (checksum !== backup.checksum) throw new Error('旧扫描历史备份校验失败，拒绝导入')

  const sources: Array<{ rows: any[]; fallback: 'success' | 'failed'; source: string }> = [
    { rows: backup.tables.task || [], fallback: 'failed', source: 'task' },
    { rows: backup.tables.taskSuccess || [], fallback: 'success', source: 'taskSuccess' },
    { rows: backup.tables.taskFailed || [], fallback: 'failed', source: 'taskFailed' },
  ]
  let imported = 0
  for (const source of sources) {
    for (const row of source.rows) {
      if (!/scan/i.test(String(row.command || row.taskName || ''))) continue
      const marker = `legacy:${source.source}:${row.taskId}`
      const existing = await db.scanRun.findFirst({ where: { message: marker } })
      if (existing) continue
      const args = parseArgs(row.args)
      const pathId = Number(args.pathId || 0) || null
      const pathRecord = pathId
        ? await db.path.findUnique({
            where: { pathId },
            select: { mediaId: true, pathContent: true },
          })
        : null
      const status = legacyStatus(row.status, source.fallback)
      await db.scanRun.create({
        data: {
          runType: 'legacy',
          triggerType: 'migration',
          status,
          mediaId: pathRecord?.mediaId || null,
          pathId,
          pathContent: pathRecord?.pathContent || args.pathContent || null,
          configSnapshot: JSON.stringify({ legacyTask: row }),
          message: marker,
          error: row.error || null,
          startedAt: row.startTime || null,
          finishedAt:
            row.endTime ||
            (status === 'success' || status === 'failed' ? row.updateTime || null : null),
          createTime: row.createTime || new Date(),
        },
      })
      imported += 1
    }
  }

  const marker = await db.scanRun.findFirst({ where: { message: MIGRATION_MARKER } })
  if (!marker) {
    await db.scanRun.create({
      data: {
        runType: 'legacy',
        triggerType: 'migration',
        status: 'success',
        message: MIGRATION_MARKER,
        summaryJson: JSON.stringify({ imported, rowCounts: backup.rowCounts }),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    })
  }

  const importedPath = backupFile.replace(/\.json$/, '.imported.json')
  await fs.promises.rename(backupFile, importedPath)
  console.log(`[migration] imported ${imported} legacy scan records from ${importedPath}`)
  return imported
}

export async function migrateLegacyScanHistory(db: any) {
  if (!db) return 0
  const marker = await db.scanRun.findFirst({ where: { message: MIGRATION_MARKER } })
  if (marker) return 0
  const backupFile = await backupLegacyScanTables(db)
  if (!backupFile) return 0
  return importLegacyScanHistory(db, backupFile)
}
