import { watch, existsSync, realpathSync, type FSWatcher } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { SUPPORTED_EXTENSIONS } from '../parsers'
import { listLibraries } from './libraries'
import { markMissingByPaths, reconcileMissing } from './models'
import type { ImportService } from './imports'
import { logError, logInfo, logWarn } from '../utils/log'

/**
 * 文件夹监控（Phase 2）。
 *
 * 两条通道共用同一个导入入口：
 * 1. fs.watch 的 FSEvents 回调 —— 平台支持时几乎实时。
 *    实测在部分环境下 recursive watch 收不到事件，所以它只是加速通道。
 * 2. 定时轮询快照 —— 每 8s 比对目录内文件的 mtime，才是可靠的那条。
 *
 * 其它设计取舍：
 * - 事件先 debounce 2s 再导入，避免读到写了一半的模型。
 * - 走 ImportService.importPaths 做单文件增量导入，SHA-256 去重、
 *   托管库同名不覆盖、缩略图按内容哈希失效这些既有逻辑自动生效。
 * - 删除不在这里自动删记录：文件消失只把记录标成「文件丢失」，
 *   物理删除和库记录移除仍由用户显式操作，避免误删。
 */

const DEBOUNCE_MS = 2000
const POLL_MS = 8000
const MAX_BATCH = 40
const MAX_DEPTH = 4
const MAX_FILES = 20000

const watchers = new Map<string, FSWatcher>()
const polls = new Map<string, ReturnType<typeof setInterval>>()
const snapshots = new Map<string, Map<string, number>>()
const pending = new Map<string, Set<string>>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let importer: ImportService | null = null
let changeEmitter: (() => void) | null = null

/** 由 IPC 层注入：后台改动模型记录后通知渲染进程刷新 */
export function setChangeEmitter(fn: (() => void) | null): void {
  changeEmitter = fn
}

function emitChange(): void {
  try {
    if (changeEmitter) {
      logInfo('models-changed emitted')
      changeEmitter()
    } else {
      logWarn('models-changed skipped: no emitter bound')
    }
  } catch (error) {
    logWarn('models-changed emit failed', error)
  }
}

// SUPPORTED_EXTENSIONS 里是不带点的形式（stl / obj / 3mf），
// extname 返回带点（.stl），两边都要归一化后再比对，否则会过滤掉所有文件。
const SUPPORTED = new Set(SUPPORTED_EXTENSIONS.map((e) => e.replace(/^\./, '').toLowerCase()))

function isSupported(file: string): boolean {
  const ext = extname(file).replace(/^\./, '').toLowerCase()
  if (!SUPPORTED.has(ext)) return false
  return !file.split(/[\\/]/).some((s) => s.startsWith('.') || s === 'node_modules')
}

function clearPending(libraryId: string): void {
  const timer = timers.get(libraryId)
  if (timer) clearTimeout(timer)
  timers.delete(libraryId)
  pending.delete(libraryId)
}

function flush(libraryId: string): void {
  timers.delete(libraryId)
  const files = pending.get(libraryId)
  pending.delete(libraryId)
  if (!files || files.size === 0 || !importer) return

  const batch = [...files].slice(0, MAX_BATCH)
  logInfo(`watch flush: ${batch.length} file(s)`)
  if (files.size > MAX_BATCH) {
    logWarn(`watch batch truncated for ${libraryId}: ${files.size} -> ${MAX_BATCH}`)
  }
  void importer.importPaths(libraryId, batch).catch((error) => {
    logError('watch import failed', error)
  })
}

function enqueue(libraryId: string, filePath: string): void {
  const set = pending.get(libraryId) ?? new Set<string>()
  set.add(filePath)
  pending.set(libraryId, set)

  const existing = timers.get(libraryId)
  if (existing) clearTimeout(existing)
  timers.set(
    libraryId,
    setTimeout(() => flush(libraryId), DEBOUNCE_MS)
  )
}

/** 递归列出目录下受支持模型文件的 mtime，作为轮询比对快照 */
async function buildSnapshot(dir: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const walk = async (current: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || out.size >= MAX_FILES) return
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (out.size >= MAX_FILES) return
      if (entry.name.startsWith('.')) continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full, depth + 1)
        continue
      }
      if (!entry.isFile() || !isSupported(entry.name)) continue
      try {
        const info = await stat(full)
        out.set(full, info.mtimeMs)
      } catch {
        // 文件在遍历途中被删掉，跳过
      }
    }
  }
  await walk(dir, 0)
  return out
}

function startPolling(libraryId: string, dir: string): void {
  const poll = setInterval(() => {
    void (async () => {
      try {
        const current = await buildSnapshot(dir)
        const previous = snapshots.get(libraryId)
        snapshots.set(libraryId, current)
        if (!previous) return
        const changed: string[] = []
        for (const [filePath, mtime] of current) {
          if (previous.get(filePath) !== mtime) changed.push(filePath)
        }
        if (changed.length > 0) {
          logInfo(`watch poll: ${changed.length} changed file(s)`)
          // 文件回来了（之前被标成缺失）就先摘掉标记，再走导入判定
          const revived = markMissingByPaths(changed, false)
          if (revived > 0) emitChange()
          for (const filePath of changed) enqueue(libraryId, filePath)
        }
        // 文件消失：只打「文件丢失」标记，不删库记录
        const gone: string[] = []
        for (const filePath of previous.keys()) {
          if (!current.has(filePath)) gone.push(filePath)
        }
        if (gone.length > 0) {
          const flagged = markMissingByPaths(gone, true)
          logInfo(`watch poll: ${gone.length} removed file(s), ${flagged} newly flagged missing`)
          if (flagged > 0) emitChange()
        }
      } catch (error) {
        logWarn(`watch poll failed: ${dir}`, error)
      }
    })()
  }, POLL_MS)
  polls.set(libraryId, poll)
}

function startOne(libraryId: string, dir: string): void {
  // 先建基线快照：启动时目录里已存在的文件不重复导入，只有之后的变化才入库
  void buildSnapshot(dir)
    .then((snap) => {
      snapshots.set(libraryId, snap)
      // 基线同时用来校准 missing：重启后遗留在库里的、目录已不存在的文件要补标记
      const fixed = reconcileMissing(libraryId, new Set(snap.keys()))
      if (fixed > 0) {
        logInfo(`watch baseline: ${fixed} missing flag(s) reconciled`)
        emitChange()
      }
    })
    .catch((error) => logWarn(`watch snapshot failed: ${dir}`, error))
  startPolling(libraryId, dir)

  try {
    // 监听用真实路径：/tmp 这类符号链接上直接 watch 收不到 FSEvents；
    // 入库路径仍用库自己的原始路径，保证与 DB 中已有路径前缀一致。
    let realDir = dir
    try {
      realDir = realpathSync(dir)
    } catch {
      logWarn(`realpath failed, fallback to raw path: ${dir}`)
    }
    const watcher = watch(realDir, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const rel = String(filename)
      if (!isSupported(rel)) return
      const full = join(dir, rel)
      // 删除/改名事件由轮询负责打缺失标记，这里不再触发一次注定失败的导入
      if (!existsSync(full)) return
      enqueue(libraryId, full)
    })
    watcher.on('error', (error) => {
      logWarn(`watch error on ${dir} (polling still active)`, error)
    })
    watchers.set(libraryId, watcher)
  } catch (error) {
    // 没有 FSEvents 也不影响轮询通道
    logWarn(`watch unavailable, polling only: ${dir}`, error)
  }
  logInfo(`watch started: ${dir}`)
}

/** 按当前库设置对齐监控器：新增开启的库开始监听，关闭/删除的库停止监听 */
export function syncWatchers(): void {
  const libraries = listLibraries()
  for (const [id, watcher] of watchers) {
    const lib = libraries.find((l) => l.id === id)
    if (!lib || !lib.watch) {
      watcher.close()
      watchers.delete(id)
      logInfo(`watch stopped: ${id}`)
    }
  }
  for (const [id, poll] of polls) {
    const lib = libraries.find((l) => l.id === id)
    if (!lib || !lib.watch) {
      clearInterval(poll)
      polls.delete(id)
      snapshots.delete(id)
      clearPending(id)
    }
  }
  for (const lib of libraries) {
    if (!lib.watch) continue
    if (watchers.has(lib.id) || polls.has(lib.id)) continue
    startOne(lib.id, lib.path)
  }
}

export function initWatcher(service: ImportService): void {
  importer = service
  syncWatchers()
}

export function stopAllWatchers(): void {
  for (const [, watcher] of watchers) watcher.close()
  watchers.clear()
  for (const [, poll] of polls) clearInterval(poll)
  polls.clear()
  snapshots.clear()
  for (const id of [...timers.keys()]) clearPending(id)
}
