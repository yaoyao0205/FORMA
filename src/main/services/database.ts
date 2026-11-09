import Database from 'better-sqlite3'
import { join } from 'node:path'
import { ensureDir } from '../utils/fsx'
import { logInfo } from '../utils/log'

let db: Database.Database | null = null

interface Migration {
  id: number
  name: string
  sql: string
}

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE IF NOT EXISTS libraries (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'reference',
        watch INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        filename TEXT NOT NULL,
        filename_lower TEXT NOT NULL,
        ext TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        sha256 TEXT,
        mtime INTEGER NOT NULL DEFAULT 0,
        imported_at INTEGER NOT NULL,
        mode TEXT NOT NULL DEFAULT 'reference',
        bbox_x REAL,
        bbox_y REAL,
        bbox_z REAL,
        unit TEXT NOT NULL DEFAULT 'mm',
        unit_declared INTEGER NOT NULL DEFAULT 0,
        vertices INTEGER,
        triangles INTEGER,
        mesh_count INTEGER,
        volume_mm3 REAL,
        closed INTEGER,
        favorite INTEGER NOT NULL DEFAULT 0,
        rating INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        source_url TEXT,
        print_status TEXT NOT NULL DEFAULT 'none',
        thumbnail TEXT,
        custom_cover TEXT,
        missing INTEGER NOT NULL DEFAULT 0,
        parse_error TEXT,
        deleted_at INTEGER
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_models_library_path
        ON models(library_id, path) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_models_sha ON models(sha256);
      CREATE INDEX IF NOT EXISTS idx_models_imported ON models(imported_at DESC);
      CREATE INDEX IF NOT EXISTS idx_models_ext ON models(ext);
      CREATE INDEX IF NOT EXISTS idx_models_name ON models(filename_lower);

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#E3A566',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#619BF0',
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

      CREATE TABLE IF NOT EXISTS model_tags (
        model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (model_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS model_projects (
        model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        PRIMARY KEY (model_id, project_id)
      );

      CREATE TABLE IF NOT EXISTS print_records (
        id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        material TEXT,
        color TEXT,
        duration_seconds INTEGER,
        result TEXT,
        printed_at INTEGER NOT NULL,
        notes TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_print_model ON print_records(model_id, printed_at DESC);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `
  },
  {
    id: 2,
    name: 'split warnings from parse_error',
    // 解析成功但带提示（比如 3MF 有标题、OBJ 声明了材质）的模型，
    // 之前把提示文案塞进了 parse_error，界面会误判成「解析失败」。
    // 这里把提示拆到独立列，parse_error 只保留真正的失败原因。
    sql: `
      ALTER TABLE models ADD COLUMN warnings TEXT;
      UPDATE models SET warnings = parse_error, parse_error = NULL
        WHERE parse_error IS NOT NULL AND parse_error NOT LIKE '%失败%';
    `
  }
]

export function initDatabase(dataDir: string): Database.Database {
  if (db) return db
  ensureDir(dataDir).catch(() => undefined)
  const file = join(dataDir, 'forma.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  runMigrations(db)
  seedSettings(db)
  logInfo('database ready:', file)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('数据库尚未初始化')
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

function runMigrations(instance: Database.Database): void {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `)
  const applied = instance
    .prepare('SELECT id FROM schema_migrations')
    .all() as { id: number }[]
  const done = new Set(applied.map((r) => r.id))

  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue
    const tx = instance.transaction(() => {
      instance.exec(m.sql)
      instance
        .prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)')
        .run(m.id, m.name, Date.now())
    })
    tx()
    logInfo('migration applied:', m.id, m.name)
  }
}

function seedSettings(instance: Database.Database): void {
  const defaults: Record<string, string> = {
    defaultUnit: 'mm',
    gridDensity: 'cozy',
    background: 'dark',
    externalApps: JSON.stringify([])
  }
  const insert = instance.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING'
  )
  for (const [key, value] of Object.entries(defaults)) {
    insert.run(key, value)
  }
}
