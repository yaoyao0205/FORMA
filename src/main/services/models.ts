import { shell } from 'electron'
import { getDb } from './database'
import { unlink } from 'node:fs/promises'
import type {
  DuplicateGroup,
  ModelAsset,
  PrintRecord,
  PrintStatus,
  Project,
  QueryParams,
  QueryResult,
  Stats,
  Tag,
  Unit,
  UpdatePatch
} from '@shared/types'
import { logError } from '../utils/log'
import { exists } from '../utils/fsx'

export interface ModelRow {
  id: string
  library_id: string
  path: string
  filename: string
  filename_lower: string
  ext: string
  size: number
  sha256: string | null
  mtime: number
  imported_at: number
  mode: string
  bbox_x: number | null
  bbox_y: number | null
  bbox_z: number | null
  unit: string
  unit_declared: number
  vertices: number | null
  triangles: number | null
  mesh_count: number | null
  volume_mm3: number | null
  closed: number | null
  favorite: number
  rating: number
  notes: string | null
  source_url: string | null
  print_status: string
  thumbnail: string | null
  custom_cover: string | null
  missing: number
  parse_error: string | null
  warnings: string | null
  deleted_at: number | null
}

const SORT_SQL: Record<string, string> = {
  name: 'm.filename_lower',
  imported: 'm.imported_at',
  modified: 'm.mtime',
  size: 'm.size',
  triangles: 'COALESCE(m.triangles, 0)',
  height: 'COALESCE(m.bbox_z, 0)'
}

function buildWhere(params: QueryParams): { sql: string; args: unknown[] } {
  const clauses: string[] = []
  const args: unknown[] = []

  if (!params.includeDeleted) clauses.push('m.deleted_at IS NULL')
  if (params.libraryId) {
    clauses.push('m.library_id = ?')
    args.push(params.libraryId)
  }
  if (params.search && params.search.trim().length > 0) {
    const q = `%${params.search.trim().toLowerCase()}%`
    clauses.push('(m.filename_lower LIKE ? OR LOWER(COALESCE(m.notes, \'\')) LIKE ?)')
    args.push(q, q)
  }
  if (params.tagIds && params.tagIds.length > 0) {
    for (const tagId of params.tagIds) {
      clauses.push(
        'EXISTS (SELECT 1 FROM model_tags mt WHERE mt.model_id = m.id AND mt.tag_id = ?)'
      )
      args.push(tagId)
    }
  }
  if (params.projectIds && params.projectIds.length > 0) {
    for (const pid of params.projectIds) {
      clauses.push(
        'EXISTS (SELECT 1 FROM model_projects mp WHERE mp.model_id = m.id AND mp.project_id = ?)'
      )
      args.push(pid)
    }
  }
  if (params.exts && params.exts.length > 0) {
    const placeholders = params.exts.map(() => '?').join(',')
    clauses.push(`m.ext IN (${placeholders})`)
    args.push(...params.exts.map((e) => e.toLowerCase()))
  }
  if (params.favoritesOnly) clauses.push('m.favorite = 1')
  if (params.missingOnly) clauses.push('m.missing = 1')
  if (params.printStatus) {
    clauses.push('m.print_status = ?')
    args.push(params.printStatus)
  }
  if (params.recentDays && params.recentDays > 0) {
    const cutoff = Date.now() - params.recentDays * 86_400_000
    clauses.push('m.imported_at >= ?')
    args.push(cutoff)
  }
  if (params.uncategorizedOnly) {
    clauses.push(
      'NOT EXISTS (SELECT 1 FROM model_tags mt2 WHERE mt2.model_id = m.id) AND NOT EXISTS (SELECT 1 FROM model_projects mp2 WHERE mp2.model_id = m.id)'
    )
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    args
  }
}

function attachRelations(rows: ModelRow[]): ModelAsset[] {
  if (rows.length === 0) return []
  const db = getDb()
  const ids = rows.map((r) => r.id)
  const placeholders = ids.map(() => '?').join(',')

  const tagRows = db
    .prepare(
      `SELECT mt.model_id AS model_id, t.id AS id, t.name AS name, t.color AS color
       FROM model_tags mt JOIN tags t ON t.id = mt.tag_id
       WHERE mt.model_id IN (${placeholders})`
    )
    .all(...ids) as { model_id: string; id: string; name: string; color: string }[]

  const projRows = db
    .prepare(
      `SELECT mp.model_id AS model_id, p.id AS id
       FROM model_projects mp JOIN projects p ON p.id = mp.project_id
       WHERE mp.model_id IN (${placeholders})`
    )
    .all(...ids) as { model_id: string; id: string }[]

  const tagMap = new Map<string, Tag[]>()
  for (const t of tagRows) {
    const list = tagMap.get(t.model_id) ?? []
    list.push({ id: t.id, name: t.name, color: t.color })
    tagMap.set(t.model_id, list)
  }
  const projMap = new Map<string, string[]>()
  for (const p of projRows) {
    const list = projMap.get(p.model_id) ?? []
    list.push(p.id)
    projMap.set(p.model_id, list)
  }

  return rows.map((r) => rowToAsset(r, tagMap.get(r.id) ?? [], projMap.get(r.id) ?? []))
}

function rowToAsset(r: ModelRow, tags: Tag[], projectIds: string[]): ModelAsset {
  const bbox =
    r.bbox_x !== null && r.bbox_y !== null && r.bbox_z !== null
      ? { x: r.bbox_x, y: r.bbox_y, z: r.bbox_z }
      : null
  return {
    id: r.id,
    libraryId: r.library_id,
    path: r.path,
    filename: r.filename,
    ext: r.ext,
    size: r.size,
    sha256: r.sha256,
    mtime: r.mtime,
    importedAt: r.imported_at,
    mode: (r.mode === 'managed' ? 'managed' : 'reference') as ModelAsset['mode'],
    bbox,
    unit: (r.unit as Unit) ?? 'mm',
    unitDeclared: r.unit_declared === 1,
    vertices: r.vertices,
    triangles: r.triangles,
    meshCount: r.mesh_count,
    volumeMm3: r.volume_mm3,
    closed: r.closed === null ? null : r.closed === 1,
    favorite: r.favorite === 1,
    rating: r.rating,
    notes: r.notes,
    sourceUrl: r.source_url,
    printStatus: (r.print_status as PrintStatus) ?? 'none',
    thumbnail: r.thumbnail,
    customCover: r.custom_cover,
    missing: r.missing === 1,
    parseError: r.parse_error,
    warnings: r.warnings ?? null,
    deletedAt: r.deleted_at,
    tags,
    projectIds
  }
}

export function queryModels(params: QueryParams): QueryResult {
  const db = getDb()
  const { sql: whereSql, args } = buildWhere(params)
  const sortKey = SORT_SQL[params.sort ?? 'imported'] ?? SORT_SQL.imported
  const dir = params.direction === 'asc' ? 'ASC' : 'DESC'
  const limit = Math.min(Math.max(params.limit ?? 500, 1), 2000)
  const offset = Math.max(params.offset ?? 0, 0)

  const orderSql =
    params.sort === 'name'
      ? `ORDER BY ${sortKey} ${params.direction === 'desc' ? 'DESC' : 'ASC'}`
      : `ORDER BY ${sortKey} ${dir}, m.imported_at DESC`

  const rows = db
    .prepare(`SELECT m.* FROM models m ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
    .all(...args, limit, offset) as ModelRow[]

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM models m ${whereSql}`).get(...args) as { c: number }
  ).c

  return { rows: attachRelations(rows), total }
}

export function getModel(id: string): ModelAsset | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as ModelRow | undefined
  if (!row) return null
  const assets = attachRelations([row])
  return assets[0] ?? null
}

export function updateModel(id: string, patch: UpdatePatch): ModelAsset {
  const db = getDb()
  const sets: string[] = []
  const args: unknown[] = []

  const push = (col: string, value: unknown) => {
    sets.push(`${col} = ?`)
    args.push(value)
  }

  if (patch.favorite !== undefined) push('favorite', patch.favorite ? 1 : 0)
  if (patch.rating !== undefined) push('rating', Math.max(0, Math.min(5, patch.rating)))
  if (patch.notes !== undefined) push('notes', patch.notes)
  if (patch.sourceUrl !== undefined) push('source_url', patch.sourceUrl)
  if (patch.unit !== undefined) {
    push('unit', patch.unit)
    push('unit_declared', 1)
  }
  if (patch.printStatus !== undefined) push('print_status', patch.printStatus)
  if (patch.customCover !== undefined) push('custom_cover', patch.customCover)

  if (sets.length > 0) {
    db.prepare(`UPDATE models SET ${sets.join(', ')} WHERE id = ?`).run(...args, id)
  }

  if (patch.tags !== undefined) {
    db.prepare('DELETE FROM model_tags WHERE model_id = ?').run(id)
    const insert = db.prepare(
      'INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)'
    )
    for (const tagId of patch.tags) insert.run(id, tagId)
  }
  if (patch.projectIds !== undefined) {
    db.prepare('DELETE FROM model_projects WHERE model_id = ?').run(id)
    const insert = db.prepare(
      'INSERT OR IGNORE INTO model_projects (model_id, project_id) VALUES (?, ?)'
    )
    for (const pid of patch.projectIds) insert.run(id, pid)
  }

  const updated = getModel(id)
  if (!updated) throw new Error('模型不存在')
  return updated
}

export async function deleteModels(
  ids: string[],
  deleteFiles: boolean
): Promise<{ records: number; files: number }> {
  const db = getDb()
  const rows = db
    .prepare(`SELECT * FROM models WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids) as ModelRow[]

  let files = 0
  if (deleteFiles) {
    for (const row of rows) {
      if (!(await exists(row.path))) continue
      try {
        await shell.trashItem(row.path)
        files += 1
      } catch (error) {
        logError('trash failed', row.path, error)
      }
    }
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE models SET deleted_at = ?, missing = ? WHERE id IN (${ids.map(() => '?').join(',')})`
    ).run(Date.now(), deleteFiles ? 1 : 0, ...ids)
  })
  tx()

  return { records: rows.length, files }
}

export function restoreModels(ids: string[]): { restored: number } {
  const db = getDb()
  const res = db
    .prepare(`UPDATE models SET deleted_at = NULL WHERE id IN (${ids.map(() => '?').join(',')})`)
    .run(...ids)
  return { restored: res.changes }
}

export async function revealModel(id: string): Promise<{ ok: boolean }> {
  const model = getModel(id)
  if (!model) return { ok: false }
  shell.showItemInFolder(model.path)
  return { ok: true }
}

/**
 * 按精确路径批量切换「文件丢失」标记。
 * 比 refreshMissingFlags 全量 stat 便宜得多，供文件夹监控在发现文件消失/回归时调用。
 * 返回实际发生变化的记录数（已经是目标状态的不算）。
 */
export function markMissingByPaths(paths: string[], missing: boolean): number {
  if (paths.length === 0) return 0
  const db = getDb()
  const CHUNK = 200 // SQLite 变量上限 999，留足余量
  let changed = 0
  for (let i = 0; i < paths.length; i += CHUNK) {
    const chunk = paths.slice(i, i + CHUNK)
    const sql =
      'UPDATE models SET missing = ? WHERE deleted_at IS NULL AND missing = ? AND path IN (' +
      chunk.map(() => '?').join(',') +
      ')'
    const result = db.prepare(sql).run(missing ? 1 : 0, missing ? 0 : 1, ...chunk)
    changed += Number(result.changes ?? 0)
  }
  return changed
}

/**
 * 用一份「目录里当前真实存在的文件」集合校准某个库的 missing 标记。
 * 启动建基线时调用一次，保证重启后残留的错误标记能自动收敛。
 */
export function reconcileMissing(libraryId: string, present: Set<string>): number {
  const db = getDb()
  const rows = db
    .prepare('SELECT path, missing FROM models WHERE library_id = ? AND deleted_at IS NULL')
    .all(libraryId) as { path: string; missing: number }[]
  const toMissing: string[] = []
  const toPresent: string[] = []
  for (const row of rows) {
    const alive = present.has(row.path)
    if (!alive && row.missing === 0) toMissing.push(row.path)
    else if (alive && row.missing === 1) toPresent.push(row.path)
  }
  let changed = 0
  if (toMissing.length > 0) changed += markMissingByPaths(toMissing, true)
  if (toPresent.length > 0) changed += markMissingByPaths(toPresent, false)
  return changed
}

export async function refreshMissingFlags(): Promise<number> {
  const db = getDb()
  const rows = db
    .prepare('SELECT id, path, missing FROM models WHERE deleted_at IS NULL')
    .all() as { id: string; path: string; missing: number }[]
  let changed = 0
  for (const row of rows) {
    const alive = await exists(row.path)
    const flag = alive ? 0 : 1
    if (flag !== row.missing) {
      db.prepare('UPDATE models SET missing = ? WHERE id = ?').run(flag, row.id)
      changed += 1
    }
  }
  return changed
}

export function getStats(): Stats {
  const db = getDb()
  const count = (db.prepare('SELECT COUNT(*) AS c FROM models WHERE deleted_at IS NULL').get() as {
    c: number
  }).c
  const bytes = (
    db
      .prepare('SELECT COALESCE(SUM(size), 0) AS s FROM models WHERE deleted_at IS NULL')
      .get() as { s: number }
  ).s
  const missing = (
    db.prepare('SELECT COUNT(*) AS c FROM models WHERE deleted_at IS NULL AND missing = 1').get() as {
      c: number
    }
  ).c
  const extRows = db
    .prepare(
      'SELECT ext, COUNT(*) AS c FROM models WHERE deleted_at IS NULL GROUP BY ext ORDER BY c DESC'
    )
    .all() as { ext: string; c: number }[]
  const byExt: Record<string, number> = {}
  for (const r of extRows) byExt[r.ext] = r.c
  return { count, bytes, byExt, missing }
}

export function listTags(): Tag[] {
  return getDb().prepare('SELECT id, name, color FROM tags ORDER BY name COLLATE NOCASE').all() as Tag[]
}

export function createTag(name: string, color = '#619BF0'): Tag {
  const db = getDb()
  const clean = name.trim().slice(0, 40)
  if (!clean) throw new Error('标签名不能为空')
  const existing = db.prepare('SELECT id, name, color FROM tags WHERE name = ?').get(clean) as Tag | undefined
  if (existing) return existing
  const tag: Tag = { id: `tag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, name: clean, color }
  db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(
    tag.id,
    tag.name,
    tag.color,
    Date.now()
  )
  return tag
}

export function updateTag(id: string, patch: Partial<Pick<Tag, 'name' | 'color'>>): Tag {
  const db = getDb()
  const sets: string[] = []
  const args: unknown[] = []
  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 40)
    if (!clean) throw new Error('标签名不能为空')
    sets.push('name = ?')
    args.push(clean)
  }
  if (patch.color !== undefined) {
    sets.push('color = ?')
    args.push(patch.color)
  }
  if (sets.length > 0) {
    db.prepare(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`).run(...args, id)
  }
  const row = db.prepare('SELECT id, name, color FROM tags WHERE id = ?').get(id) as Tag | undefined
  if (!row) throw new Error('标签不存在')
  return row
}

export function deleteTag(id: string): { ok: boolean } {
  getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
  return { ok: true }
}

export function listProjects(): Project[] {
  return getDb()
    .prepare('SELECT id, name, color, sort_order AS sortOrder, created_at AS createdAt FROM projects ORDER BY sort_order, created_at')
    .all() as Project[]
}

export function createProject(name: string, color = '#E3A566'): Project {
  const db = getDb()
  const clean = name.trim().slice(0, 60)
  if (!clean) throw new Error('项目名不能为空')
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM projects').get() as { m: number }
  ).m
  const project: Project = {
    id: `prj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: clean,
    color,
    sortOrder: maxOrder + 1,
    createdAt: Date.now()
  }
  db.prepare('INSERT INTO projects (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').run(
    project.id,
    project.name,
    project.color,
    project.sortOrder,
    project.createdAt
  )
  return project
}

export function updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'color'>>): Project {
  const db = getDb()
  const sets: string[] = []
  const args: unknown[] = []
  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 60)
    if (!clean) throw new Error('项目名不能为空')
    sets.push('name = ?')
    args.push(clean)
  }
  if (patch.color !== undefined) {
    sets.push('color = ?')
    args.push(patch.color)
  }
  if (sets.length > 0) {
    db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...args, id)
  }
  const row = db
    .prepare('SELECT id, name, color, sort_order AS sortOrder, created_at AS createdAt FROM projects WHERE id = ?')
    .get(id) as Project | undefined
  if (!row) throw new Error('项目不存在')
  return row
}

export function deleteProject(id: string): { ok: boolean } {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
  return { ok: true }
}

export function addPrintRecord(input: {
  modelId: string
  status: PrintStatus
  material?: string | null
  color?: string | null
  durationSeconds?: number | null
  result?: string | null
  notes?: string | null
  printedAt?: number
}): PrintRecord {
  const db = getDb()
  const record: PrintRecord = {
    id: `prt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    modelId: input.modelId,
    status: input.status,
    material: input.material ?? null,
    color: input.color ?? null,
    durationSeconds: input.durationSeconds ?? null,
    result: input.result ?? null,
    printedAt: input.printedAt ?? Date.now(),
    notes: input.notes ?? null
  }
  db.prepare(
    `INSERT INTO print_records (id, model_id, status, material, color, duration_seconds, result, printed_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.modelId,
    record.status,
    record.material,
    record.color,
    record.durationSeconds,
    record.result,
    record.printedAt,
    record.notes
  )
  db.prepare('UPDATE models SET print_status = ? WHERE id = ?').run(input.status, input.modelId)
  return record
}

export function listPrintRecords(modelId: string): PrintRecord[] {
  return getDb()
    .prepare(
      `SELECT id, model_id AS modelId, status, material, color,
              duration_seconds AS durationSeconds, result, printed_at AS printedAt, notes
       FROM print_records WHERE model_id = ? ORDER BY printed_at DESC`
    )
    .all(modelId) as PrintRecord[]
}

export function deletePrintRecord(id: string): { ok: boolean } {
  getDb().prepare('DELETE FROM print_records WHERE id = ?').run(id)
  return { ok: true }
}

export function findModelByPath(libraryId: string, path: string): ModelRow | null {
  const row = getDb()
    .prepare('SELECT * FROM models WHERE library_id = ? AND path = ?')
    .get(libraryId, path) as ModelRow | undefined
  return row ?? null
}

export function findModelByHash(libraryId: string, sha256: string): ModelRow | null {
  const row = getDb()
    .prepare('SELECT * FROM models WHERE library_id = ? AND sha256 = ? AND deleted_at IS NULL')
    .get(libraryId, sha256) as ModelRow | undefined
  return row ?? null
}

export function unlinkModelFile(path: string): Promise<void> {
  return unlink(path).catch(() => undefined)
}


export function findDuplicates(libraryId?: string): DuplicateGroup[] {
  const db = getDb()
  const where = libraryId
    ? 'deleted_at IS NULL AND sha256 IS NOT NULL AND library_id = ?'
    : 'deleted_at IS NULL AND sha256 IS NOT NULL'
  const args = libraryId ? [libraryId] : []
  const hashes = db
    .prepare(
      `SELECT sha256, COUNT(*) AS c FROM models WHERE ${where} GROUP BY sha256 HAVING c > 1 ORDER BY c DESC`
    )
    .all(...args) as { sha256: string; c: number }[]

  const groups: DuplicateGroup[] = []
  for (const h of hashes) {
    const rows = db
      .prepare('SELECT * FROM models WHERE sha256 = ? AND deleted_at IS NULL ORDER BY imported_at ASC')
      .all(h.sha256) as ModelRow[]
    if (rows.length < 2) continue
    groups.push({ sha256: h.sha256, models: attachRelations(rows) })
  }
  return groups
}
