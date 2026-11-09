import { app } from 'electron'
import { join } from 'node:path'
import { getDb } from './database'
import { ensureDir } from '../utils/fsx'
import type { Library, LibraryMode } from '@shared/types'

export function listLibraries(): Library[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT l.id, l.name, l.path, l.mode, l.watch, l.created_at AS createdAt,
              l.updated_at AS updatedAt,
              (SELECT COUNT(*) FROM models m WHERE m.library_id = l.id AND m.deleted_at IS NULL) AS modelCount
       FROM libraries l ORDER BY l.created_at ASC`
    )
    .all() as (Omit<Library, 'watch'> & { watch: number })[]
  return rows.map((r) => ({ ...r, watch: r.watch === 1 }))
}

export function getLibrary(id: string): Library | null {
  const all = listLibraries()
  return all.find((l) => l.id === id) ?? null
}

export async function createLibrary(input: {
  name: string
  path?: string
  mode?: LibraryMode
}): Promise<Library> {
  const db = getDb()
  const mode: LibraryMode = input.mode === 'managed' ? 'managed' : 'reference'
  const id = `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  let path = input.path?.trim()
  if (mode === 'managed') {
    path = join(app.getPath('userData'), 'libraries', id)
    await ensureDir(path)
  }
  if (!path) throw new Error('引用模式必须指定模型库目录')

  const now = Date.now()
  db.prepare(
    'INSERT INTO libraries (id, name, path, mode, watch, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
  ).run(id, input.name.trim() || '未命名模型库', path, mode, now, now)

  return {
    id,
    name: input.name.trim() || '未命名模型库',
    path,
    mode,
    watch: true,
    createdAt: now,
    updatedAt: now,
    modelCount: 0
  }
}

export function updateLibrary(
  id: string,
  patch: Partial<Pick<Library, 'name' | 'path' | 'mode' | 'watch'>>
): Library {
  const db = getDb()
  const sets: string[] = []
  const args: unknown[] = []
  if (patch.name !== undefined) {
    sets.push('name = ?')
    args.push(patch.name.trim() || '未命名模型库')
  }
  if (patch.path !== undefined) {
    sets.push('path = ?')
    args.push(patch.path)
  }
  if (patch.mode !== undefined) {
    sets.push('mode = ?')
    args.push(patch.mode === 'managed' ? 'managed' : 'reference')
  }
  if (patch.watch !== undefined) {
    sets.push('watch = ?')
    args.push(patch.watch ? 1 : 0)
  }
  if (sets.length > 0) {
    sets.push('updated_at = ?')
    args.push(Date.now())
    db.prepare(`UPDATE libraries SET ${sets.join(', ')} WHERE id = ?`).run(...args, id)
  }
  const lib = getLibrary(id)
  if (!lib) throw new Error('模型库不存在')
  return lib
}

export function removeLibrary(id: string, removeRecords: boolean): { ok: boolean } {
  const db = getDb()
  if (removeRecords) {
    db.prepare('DELETE FROM models WHERE library_id = ?').run(id)
  } else {
    db.prepare('UPDATE models SET deleted_at = ? WHERE library_id = ?').run(Date.now(), id)
  }
  db.prepare('DELETE FROM libraries WHERE id = ?').run(id)
  return { ok: true }
}
