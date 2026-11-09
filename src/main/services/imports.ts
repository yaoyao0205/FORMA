import { readdir, stat, unlink } from 'node:fs/promises'
import { join, extname, basename, relative, resolve, sep } from 'node:path'
import { getDb } from './database'
import { findModelByHash, findModelByPath } from './models'
import { getLibrary } from './libraries'
import { thumbnailPath } from './thumbnails'
import { parserFor, SUPPORTED_EXTENSIONS } from '../parsers'
import { sha256File } from '../utils/hash'
import { copyTo, exists, safeExt, uniqueDestination } from '../utils/fsx'
import { logError, logWarn } from '../utils/log'
import type { ImportResult, ScanProgress } from '@shared/types'

const SUPPORTED = new Set(SUPPORTED_EXTENSIONS)
const MAX_FILES = 20000

type Emit = (p: ScanProgress) => void

interface Candidate {
  path: string
  size: number
  mtime: number
}

export class ImportService {
  private cancelled = new Map<string, boolean>()
  private emit: Emit = () => undefined

  setEmitter(fn: Emit): void {
    this.emit = fn
  }

  cancel(libraryId: string): boolean {
    this.cancelled.set(libraryId, true)
    return true
  }

  isCancelled(libraryId: string): boolean {
    return this.cancelled.get(libraryId) === true
  }

  private progress(p: ScanProgress): void {
    try {
      this.emit(p)
    } catch (error) {
      logError('progress emit failed', error)
    }
  }

  async scanLibrary(libraryId: string): Promise<ImportResult> {
    const lib = getLibrary(libraryId)
    if (!lib) throw new Error('模型库不存在')
    return this.importPaths(libraryId, [lib.path])
  }

  async importPaths(libraryId: string, inputPaths: string[]): Promise<ImportResult> {
    const lib = getLibrary(libraryId)
    if (!lib) throw new Error('模型库不存在')
    this.cancelled.set(libraryId, false)

    const result: ImportResult = {
      imported: 0,
      duplicates: 0,
      failed: 0,
      cancelled: false,
      errors: []
    }

    this.progress({ libraryId, phase: 'discover', done: 0, total: 0 })
    const candidates = await collectCandidates(inputPaths, result.errors)
    const total = candidates.length
    this.progress({ libraryId, phase: 'discover', done: 0, total })

    if (total === 0) {
      this.progress({ libraryId, phase: 'done', done: 0, total: 0 })
      return result
    }

    let done = 0
    let cursor = 0
    const concurrency = 3

    const worker = async (): Promise<void> => {
      while (true) {
        if (this.isCancelled(libraryId)) {
          result.cancelled = true
          return
        }
        const index = cursor++
        if (index >= candidates.length) return
        const candidate = candidates[index]
        const outcome = await this.processOne(libraryId, lib.mode, candidate, result)
        if (outcome === 'imported') result.imported += 1
        else if (outcome === 'duplicate') result.duplicates += 1
        else result.failed += 1
        done += 1
        this.progress({
          libraryId,
          phase: 'parse',
          done,
          total,
          currentFile: basename(candidate.path)
        })
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()))

    this.progress({
      libraryId,
      phase: result.cancelled ? 'cancelled' : 'done',
      done,
      total
    })
    return result
  }

  private async processOne(
    libraryId: string,
    mode: 'reference' | 'managed',
    candidate: Candidate,
    result: ImportResult
  ): Promise<'imported' | 'duplicate' | 'failed'> {
    const ext = safeExt(candidate.path)
    if (!SUPPORTED.has(ext)) return 'failed'

    let finalPath = candidate.path

    try {
      // 先拿内容指纹，再决定要不要往库里复制。
      // 旧实现顺序反了：先 uniqueDestination 再算 hash，
      // 结果每次重扫都把自己的文件当成"新文件"复制一份，越扫越多。
      const sourceHash = await sha256File(candidate.path)

      if (mode === 'managed') {
        const lib = getLibrary(libraryId)
        if (!lib) return 'failed'

        if (pathInside(lib.path, candidate.path)) {
          // 文件本来就在库目录里（重扫自己的库）：原地更新，绝不复制
          finalPath = candidate.path
        } else {
          const targetPath = join(lib.path, basename(candidate.path))
          if (!(await exists(targetPath))) {
            await copyTo(candidate.path, targetPath)
            finalPath = targetPath
          } else if ((await sha256File(targetPath)) === sourceHash) {
            // 同名且内容一致：复用已有文件，重扫不会多出一份
            finalPath = targetPath
          } else {
            // 同名但内容不同：两份都要保留，用序号命名
            const dest = await uniqueDestination(lib.path, basename(candidate.path))
            await copyTo(candidate.path, dest)
            finalPath = dest
          }
        }
      }

      const facts = await stat(finalPath)
      const hash = finalPath === candidate.path ? sourceHash : await sha256File(finalPath)

      const existingSamePath = findModelByPath(libraryId, finalPath)
      if (existingSamePath && existingSamePath.deleted_at === null) {
        if (
          existingSamePath.size === facts.size &&
          existingSamePath.mtime === Math.floor(facts.mtimeMs)
        ) {
          return 'duplicate'
        }
      }

      if (!existingSamePath) {
        const hashHit = findModelByHash(libraryId, hash)
        if (hashHit) {
          return 'duplicate'
        }
      }

      const parser = parserFor(ext)
      let bounds: { min: [number, number, number]; max: [number, number, number] } | null = null
      let vertices: number | null = null
      let triangles: number | null = null
      let meshCount: number | null = null
      let unit = 'mm'
      let unitDeclared = 0
      let parseError: string | null = null
      let warningsText: string | null = null

      try {
        if (!parser) throw new Error(`不支持的格式 .${ext}`)
        const parsed = await parser.parse(finalPath, { maxTriangles: 3_000_000 })
        bounds = parsed.bounds
        vertices = parsed.vertices
        triangles = parsed.triangles
        meshCount = parsed.meshCount
        if (parsed.unitHint !== 'unknown') {
          unit = parsed.unitHint
          unitDeclared = 1
        }
        // 提示与错误分开：材质未载入、3MF 带标题这类只是"提示"，
        // 不能当成解析失败，否则正常的模型会被标成失败态。
        if (parsed.warnings.length > 0) warningsText = parsed.warnings.join('；')
        if (parsed.triangles === 0) parseError = '没有解析到可渲染的几何'
      } catch (error) {
        parseError = error instanceof Error ? error.message : String(error)
        logWarn('parse failed', finalPath, parseError)
      }

      const db = getDb()
      const width = bounds ? Math.abs(bounds.max[0] - bounds.min[0]) : null
      const depth = bounds ? Math.abs(bounds.max[1] - bounds.min[1]) : null
      const height = bounds ? Math.abs(bounds.max[2] - bounds.min[2]) : null

      if (existingSamePath) {
        db.prepare(
          `UPDATE models SET size = ?, sha256 = ?, mtime = ?, bbox_x = ?, bbox_y = ?, bbox_z = ?,
             unit = ?, unit_declared = ?, vertices = ?, triangles = ?, mesh_count = ?,
             parse_error = ?, warnings = ?, missing = 0, deleted_at = NULL
           WHERE id = ?`
        ).run(
          facts.size,
          hash,
          Math.floor(facts.mtimeMs),
          width,
          depth,
          height,
          unit,
          unitDeclared,
          vertices,
          triangles,
          meshCount,
          parseError,
          warningsText,
          existingSamePath.id
        )

        // 内容变了就必须让旧缩略图失效：缓存按 model id 命名，id 不变时
        // 界面会一直读那张旧 PNG，看起来像"改了文件但预览没变"。
        if (existingSamePath.sha256 !== hash) {
          db.prepare('UPDATE models SET thumbnail = NULL WHERE id = ?').run(existingSamePath.id)
          const stale = thumbnailPath(existingSamePath.id)
          await unlink(stale).catch(() => undefined)
          result.rethumb = result.rethumb ?? []
          result.rethumb.push(existingSamePath.id)
        }
      } else {
        const id = `mdl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
        db.prepare(
          `INSERT INTO models (
             id, library_id, path, filename, filename_lower, ext, size, sha256, mtime,
             imported_at, mode, bbox_x, bbox_y, bbox_z, unit, unit_declared,
             vertices, triangles, mesh_count, parse_error, warnings
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          libraryId,
          finalPath,
          basename(finalPath),
          basename(finalPath).toLowerCase(),
          ext,
          facts.size,
          hash,
          Math.floor(facts.mtimeMs),
          Date.now(),
          mode,
          width,
          depth,
          height,
          unit,
          unitDeclared,
          vertices,
          triangles,
          meshCount,
          parseError,
          warningsText
        )
      }

      return parseError ? 'failed' : 'imported'
    } catch (error) {
      logError('import failed', candidate.path, error)
      result.errors.push(`${basename(candidate.path)}：${error instanceof Error ? error.message : String(error)}`)
      return 'failed'
    }
  }
}

async function collectCandidates(paths: string[], errors: string[]): Promise<Candidate[]> {
  const out: Candidate[] = []

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 6 || out.length >= MAX_FILES) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      errors.push(`无法读取目录 ${dir}`)
      logWarn('readdir failed', dir, error)
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full, depth + 1)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).replace('.', '').toLowerCase()
        if (!SUPPORTED.has(ext)) continue
        try {
          const s = await stat(full)
          if (s.size === 0) continue
          out.push({ path: full, size: s.size, mtime: Math.floor(s.mtimeMs) })
        } catch {
          errors.push(`无法读取文件 ${entry.name}`)
        }
        if (out.length >= MAX_FILES) return
      }
    }
  }

  for (const p of paths) {
    const info = await stat(p).catch(() => null)
    if (!info) {
      errors.push(`路径不存在：${p}`)
      continue
    }
    if (info.isDirectory()) {
      await walk(p, 0)
    } else if (info.isFile()) {
      const ext = safeExt(p)
      if (!SUPPORTED.has(ext)) {
        errors.push(`不支持的格式：${basename(p)}`)
        continue
      }
      out.push({ path: p, size: info.size, mtime: Math.floor(info.mtimeMs) })
    }
  }

  return out
}

export function relativeToLibrary(libraryPath: string, filePath: string): string {
  return relative(libraryPath, filePath)
}

/** 判断 child 是否位于 parent 目录内部（用来识别"这就是库自己的文件"） */
export function pathInside(parent: string, child: string): boolean {
  const p = resolve(parent)
  const c = resolve(child)
  return c === p || c.startsWith(p + sep)
}
