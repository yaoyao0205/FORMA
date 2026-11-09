import { BrowserWindow, dialog, ipcMain, shell, app } from 'electron'
import { spawn } from 'node:child_process'
import { IPC } from '@shared/ipc'
import type {
  AppSettings,
  GeometryResponse,
  ImportRequest,
  LibraryMode,
  ModelAsset,
  PrintStatus,
  QueryParams,
  SortKey,
  Unit,
  UpdatePatch
} from '@shared/types'
import { createLibrary, listLibraries, removeLibrary, updateLibrary } from './services/libraries'
import { setChangeEmitter, syncWatchers } from './services/watcher'
import {
  addPrintRecord,
  createProject,
  createTag,
  deleteModels,
  deletePrintRecord,
  findDuplicates,
  deleteProject,
  deleteTag,
  getModel,
  getStats,
  listPrintRecords,
  listProjects,
  listTags,
  queryModels,
  restoreModels,
  revealModel,
  updateModel,
  updateProject,
  updateTag
} from './services/models'
import { ImportService } from './services/imports'
import { saveThumbnail } from './services/thumbnails'
import { getSettings, setSettings } from './services/settings'
import { parserFor } from './parsers'
import { orientOutward } from './parsers/orient'

/** 依据最终绕序重建逐顶点法线；非索引几何等价于逐面法线 */
function rebuildNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const out = new Float32Array(positions.length)
  const total = indices.length > 0 ? indices.length : positions.length / 3
  const at = (k: number): number => (indices.length > 0 ? indices[k] : k)
  for (let t = 0; t + 2 < total; t += 3) {
    const a = at(t) * 3
    const b = at(t + 1) * 3
    const c = at(t + 2) * 3
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a]
    const vy = positions[c + 1] - positions[a + 1]
    const vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (const o of [a, b, c]) {
      out[o] += nx
      out[o + 1] += ny
      out[o + 2] += nz
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const len = Math.hypot(out[i], out[i + 1], out[i + 2])
    if (len > 1e-9) {
      out[i] /= len
      out[i + 1] /= len
      out[i + 2] /= len
    } else {
      out[i + 2] = 1
    }
  }
  return out
}
import {
  asBoolean,
  asId,
  asIdArray,
  asNumber,
  asObject,
  asOptionalString,
  asString,
  oneOf,
  ValidationError
} from './utils/validate'
import { logError, logInfo } from './utils/log'
import { exists } from './utils/fsx'

type Handler = (payload: unknown) => unknown

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (_event, payload: unknown) => {
    try {
      return await fn(payload)
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new Error(`参数错误：${error.message}`)
      }
      logError(`ipc ${channel} failed`, error)
      throw new Error(error instanceof Error ? error.message : String(error))
    }
  })
}

const SORT_KEYS: readonly SortKey[] = ['name', 'imported', 'modified', 'size', 'triangles', 'height']
const UNITS: readonly Unit[] = ['mm', 'cm', 'inch']
const PRINT_STATUS: readonly PrintStatus[] = ['none', 'queued', 'printed', 'failed']

export function registerIpc(getWindow: () => BrowserWindow | null, importService: ImportService): void {
  importService.setEmitter((progress) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.importProgress, progress)
    }
  })
  // 文件夹监控在后台改了「文件丢失」标记时，让界面自己刷新
  setChangeEmitter(() => {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.modelsChanged)
    }
  })

  // ---------- libraries ----------
  handle(IPC.libraryList, () => listLibraries())

  handle(IPC.libraryCreate, async (payload) => {
    const o = asObject(payload, 'payload')
    const name = asString(o.name, 'name', 120)
    const path = asOptionalString(o.path, 'path', 4096)
    const mode = oneOf<LibraryMode>(o.mode, ['reference', 'managed'], 'mode', 'reference')
    if (mode === 'reference' && !path) throw new ValidationError('引用模式需要指定目录')
    const created = await createLibrary({ name, path, mode })
    syncWatchers()
    return created
  })

  handle(IPC.libraryUpdate, (payload) => {
    const o = asObject(payload, 'payload')
    const id = asId(o.id)
    const patch = asObject(o.patch, 'patch')
    const updated = updateLibrary(id, {
      name: patch.name === undefined ? undefined : asString(patch.name, 'name', 120),
      path: patch.path === undefined ? undefined : asString(patch.path, 'path', 4096),
      mode: patch.mode === undefined ? undefined : oneOf<LibraryMode>(patch.mode, ['reference', 'managed'], 'mode'),
      watch: patch.watch === undefined ? undefined : asBoolean(patch.watch, 'watch')
    })
    syncWatchers()
    return updated
  })

  handle(IPC.libraryRemove, (payload) => {
    const o = asObject(payload, 'payload')
    const removed = removeLibrary(asId(o.id), asBoolean(o.removeRecords, 'removeRecords'))
    syncWatchers()
    return removed
  })

  handle(IPC.libraryPickFolder, async (payload) => {
    const win = getWindow()
    if (!win) return { path: null, canceled: true }
    const o = payload ? asObject(payload, 'payload') : {}
    const title = o.title ? asString(o.title, 'title', 200) : '选择模型目录'
    const res = await dialog.showOpenDialog(win, {
      title,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '选择'
    })
    return { path: res.canceled ? null : res.filePaths[0] ?? null, canceled: res.canceled }
  })

  handle(IPC.libraryScan, async (payload) => {
    const o = asObject(payload, 'payload')
    const libraryId = asId(o.libraryId, 'libraryId')
    void importService.scanLibrary(libraryId).catch((error) => {
      logError('scan failed', error)
    })
    return { started: true }
  })

  handle(IPC.libraryScanCancel, (payload) => {
    const o = asObject(payload, 'payload')
    return { cancelled: importService.cancel(asId(o.libraryId, 'libraryId')) }
  })

  // ---------- models ----------
  handle(IPC.modelsQuery, (payload) => {
    const o = asObject(payload, 'payload')
    const params: QueryParams = {
      libraryId: o.libraryId === undefined ? undefined : asId(o.libraryId, 'libraryId'),
      search: asOptionalString(o.search, 'search', 200),
      tagIds: o.tagIds === undefined ? undefined : asIdArray(o.tagIds, 'tagIds'),
      projectIds: o.projectIds === undefined ? undefined : asIdArray(o.projectIds, 'projectIds'),
      exts: Array.isArray(o.exts)
        ? o.exts.map((x) => asString(x, 'exts', 16).toLowerCase())
        : undefined,
      favoritesOnly: o.favoritesOnly === undefined ? undefined : asBoolean(o.favoritesOnly, 'favoritesOnly'),
      missingOnly: o.missingOnly === undefined ? undefined : asBoolean(o.missingOnly, 'missingOnly'),
      uncategorizedOnly:
        o.uncategorizedOnly === undefined
          ? undefined
          : asBoolean(o.uncategorizedOnly, 'uncategorizedOnly'),
      recentDays: o.recentDays === undefined ? undefined : asNumber(o.recentDays, 'recentDays'),
      includeDeleted: o.includeDeleted === undefined ? undefined : asBoolean(o.includeDeleted, 'includeDeleted'),
      sort: o.sort === undefined ? 'imported' : oneOf<SortKey>(o.sort, SORT_KEYS, 'sort'),
      direction: o.direction === undefined ? 'desc' : oneOf(o.direction, ['asc', 'desc'] as const, 'direction'),
      offset: o.offset === undefined ? 0 : asNumber(o.offset, 'offset'),
      limit: o.limit === undefined ? 500 : asNumber(o.limit, 'limit'),
      printStatus:
        o.printStatus === undefined ? undefined : oneOf<PrintStatus>(o.printStatus, PRINT_STATUS, 'printStatus')
    }
    return queryModels(params)
  })

  handle(IPC.modelsGet, (payload) => {
    const o = asObject(payload, 'payload')
    return getModel(asId(o.id))
  })

  handle(IPC.modelsUpdate, (payload) => {
    const o = asObject(payload, 'payload')
    const id = asId(o.id)
    const raw = asObject(o.patch, 'patch')
    const patch: UpdatePatch = {}
    if (raw.favorite !== undefined) patch.favorite = asBoolean(raw.favorite, 'favorite')
    if (raw.rating !== undefined) patch.rating = asNumber(raw.rating, 'rating')
    if (raw.notes !== undefined) patch.notes = raw.notes === null ? null : asString(raw.notes, 'notes', 20000)
    if (raw.sourceUrl !== undefined) patch.sourceUrl = raw.sourceUrl === null ? null : asString(raw.sourceUrl, 'sourceUrl', 2048)
    if (raw.unit !== undefined) patch.unit = oneOf<Unit>(raw.unit, UNITS, 'unit')
    if (raw.printStatus !== undefined) patch.printStatus = oneOf<PrintStatus>(raw.printStatus, PRINT_STATUS, 'printStatus')
    if (raw.customCover !== undefined) patch.customCover = raw.customCover === null ? null : asString(raw.customCover, 'customCover', 4096)
    if (raw.tags !== undefined) patch.tags = asIdArray(raw.tags, 'tags')
    if (raw.projectIds !== undefined) patch.projectIds = asIdArray(raw.projectIds, 'projectIds')
    return updateModel(id, patch)
  })

  handle(IPC.modelsDelete, async (payload) => {
    const o = asObject(payload, 'payload')
    return deleteModels(asIdArray(o.ids, 'ids'), asBoolean(o.deleteFiles, 'deleteFiles'))
  })

  handle(IPC.modelsRestore, (payload) => {
    const o = asObject(payload, 'payload')
    return restoreModels(asIdArray(o.ids, 'ids'))
  })

  handle(IPC.modelsDuplicates, (payload) => {
    const o = payload ? asObject(payload, 'payload') : {}
    const libraryId = o.libraryId === undefined ? undefined : asId(o.libraryId, 'libraryId')
    return findDuplicates(libraryId)
  })

  handle(IPC.modelsReveal, (payload) => {
    const o = asObject(payload, 'payload')
    return revealModel(asId(o.id))
  })

  handle(IPC.modelsOpenWith, async (payload) => {
    const o = asObject(payload, 'payload')
    const model = getModel(asId(o.id))
    if (!model) return { ok: false, error: '模型不存在' }
    if (!(await exists(model.path))) return { ok: false, error: '文件已丢失' }
    const appPath = asOptionalString(o.appPath, 'appPath', 4096)
    if (appPath) {
      if (!(await exists(appPath))) return { ok: false, error: '指定的应用不存在' }
      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const child = spawn('/usr/bin/open', ['-a', appPath, model.path], { stdio: 'ignore' })
        child.on('error', (error) => resolve({ ok: false, error: error.message }))
        child.on('exit', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: `open 退出码 ${code}` }))
      })
    }
    const error = await shell.openPath(model.path)
    return { ok: error === '', error: error || undefined }
  })

  // ---------- import ----------
  handle(IPC.importPaths, async (payload) => {
    const o = asObject(payload, 'payload')
    const req: ImportRequest = {
      libraryId: asId(o.libraryId, 'libraryId'),
      paths: Array.isArray(o.paths) ? o.paths.map((p) => asString(p, 'paths', 4096)) : [],
      mode: o.mode === undefined ? undefined : oneOf<LibraryMode>(o.mode, ['reference', 'managed'], 'mode')
    }
    if (req.paths.length === 0) throw new ValidationError('没有可导入的文件')
    return importService.importPaths(req.libraryId, req.paths)
  })

  // ---------- geometry ----------
  handle(IPC.geometryLoad, async (payload): Promise<GeometryResponse> => {
    const o = asObject(payload, 'payload')
    const id = asId(o.id)
    const maxTriangles = o.maxTriangles === undefined ? 800_000 : asNumber(o.maxTriangles, 'maxTriangles')
    const model = getModel(id)
    if (!model) return { ok: false, error: '模型不存在' }
    if (!(await exists(model.path))) return { ok: false, error: '文件已丢失或被移动' }
    const parser = parserFor(model.ext)
    if (!parser) return { ok: false, error: `暂不支持 .${model.ext} 的预览` }

    try {
      const parsed = await parser.parse(model.path, { maxTriangles })
      if (parsed.triangles === 0) return { ok: false, error: '没有可渲染的几何数据' }

      for (const m of parsed.meshes) {
        if (orientOutward(m.positions, m.indices, m.normals)) {
          logInfo(`winding corrected: ${model.filename}/${m.name ?? 'mesh'}`)
        }
      }

      const totalPos = parsed.meshes.reduce((n, m) => n + m.positions.length, 0)
      const totalIdx = parsed.meshes.reduce((n, m) => n + m.indices.length, 0)
      const positions = new Float32Array(totalPos)
      const indices = new Uint32Array(totalIdx)
      let pOff = 0
      let iOff = 0
      let vOff = 0
      for (const m of parsed.meshes) {
        if (m.positions.length > 0) {
          positions.set(m.positions, pOff)
          pOff += m.positions.length
        }
        for (let i = 0; i < m.indices.length; i++) {
          indices[iOff + i] = m.indices[i] + vOff
        }
        iOff += m.indices.length
        vOff += Math.floor(m.positions.length / 3)
      }

      // 各解析器给出的法线口径不一致（逐面 / 逐顶点 / 缺失），统一按最终几何重建
      const normals = rebuildNormals(positions, indices)

      return {
        ok: true,
        geometry: {
          positions,
          normals,
          indices,
          bounds: {
            x: Math.abs(parsed.bounds.max[0] - parsed.bounds.min[0]),
            y: Math.abs(parsed.bounds.max[1] - parsed.bounds.min[1]),
            z: Math.abs(parsed.bounds.max[2] - parsed.bounds.min[2])
          },
          unit: parsed.unitHint === 'unknown' ? 'mm' : parsed.unitHint,
          unitDeclared: parsed.unitHint !== 'unknown',
          vertices: parsed.vertices,
          triangles: parsed.triangles,
          meshCount: parsed.meshCount,
          warnings: parsed.warnings
        }
      }
    } catch (error) {
      logError('geometry load failed', model.path, error)
      return { ok: false, error: error instanceof Error ? error.message : '解析失败' }
    }
  })

  handle(IPC.thumbnailSave, async (payload) => {
    const o = asObject(payload, 'payload')
    const modelId = asId(o.modelId, 'modelId')
    const dataUrl = asString(o.dataUrl, 'dataUrl', 12 * 1024 * 1024)
    // 退出时渲染进程的缩略图队列可能还在收尾，此时数据库已经关闭。
    // 缩略图本来就会按内容哈希重建，这里直接跳过，不当成错误。
    try {
      return await saveThumbnail(modelId, dataUrl)
    } catch (error) {
      if (/数据库尚未初始化/.test(String(error))) return { ok: false }
      throw error
    }
  })

  // ---------- tags ----------
  handle(IPC.tagsList, () => listTags())
  handle(IPC.tagsCreate, (payload) => {
    const o = asObject(payload, 'payload')
    return createTag(asString(o.name, 'name', 40), asOptionalString(o.color, 'color', 16) ?? '#619BF0')
  })
  handle(IPC.tagsUpdate, (payload) => {
    const o = asObject(payload, 'payload')
    const raw = asObject(o.patch, 'patch')
    return updateTag(asId(o.id), {
      name: raw.name === undefined ? undefined : asString(raw.name, 'name', 40),
      color: raw.color === undefined ? undefined : asString(raw.color, 'color', 16)
    })
  })
  handle(IPC.tagsDelete, (payload) => {
    const o = asObject(payload, 'payload')
    return deleteTag(asId(o.id))
  })

  // ---------- projects ----------
  handle(IPC.projectsList, () => listProjects())
  handle(IPC.projectsCreate, (payload) => {
    const o = asObject(payload, 'payload')
    return createProject(asString(o.name, 'name', 60), asOptionalString(o.color, 'color', 16) ?? '#E3A566')
  })
  handle(IPC.projectsUpdate, (payload) => {
    const o = asObject(payload, 'payload')
    const raw = asObject(o.patch, 'patch')
    return updateProject(asId(o.id), {
      name: raw.name === undefined ? undefined : asString(raw.name, 'name', 60),
      color: raw.color === undefined ? undefined : asString(raw.color, 'color', 16)
    })
  })
  handle(IPC.projectsDelete, (payload) => {
    const o = asObject(payload, 'payload')
    return deleteProject(asId(o.id))
  })

  // ---------- print ----------
  handle(IPC.printAdd, (payload) => {
    const o = asObject(payload, 'payload')
    return addPrintRecord({
      modelId: asId(o.modelId, 'modelId'),
      status: oneOf<PrintStatus>(o.status, PRINT_STATUS, 'status'),
      material: asOptionalString(o.material, 'material', 120) ?? null,
      color: asOptionalString(o.color, 'color', 120) ?? null,
      durationSeconds: o.durationSeconds === undefined ? null : asNumber(o.durationSeconds, 'durationSeconds'),
      result: asOptionalString(o.result, 'result', 200) ?? null,
      notes: asOptionalString(o.notes, 'notes', 2000) ?? null,
      printedAt: o.printedAt === undefined ? Date.now() : asNumber(o.printedAt, 'printedAt')
    })
  })
  handle(IPC.printList, (payload) => {
    const o = asObject(payload, 'payload')
    return listPrintRecords(asId(o.modelId, 'modelId'))
  })
  handle(IPC.printDelete, (payload) => {
    const o = asObject(payload, 'payload')
    return deletePrintRecord(asId(o.id))
  })

  // ---------- settings / app ----------
  handle(IPC.settingsGet, () => getSettings())
  handle(IPC.settingsSet, (payload) => {
    const o = asObject(payload, 'payload')
    const patch: Partial<AppSettings> = {}
    if (o.defaultUnit !== undefined) patch.defaultUnit = oneOf<Unit>(o.defaultUnit, UNITS, 'defaultUnit')
    if (o.gridDensity !== undefined) {
      patch.gridDensity = oneOf(o.gridDensity, ['compact', 'cozy', 'roomy'] as const, 'gridDensity')
    }
    if (o.background !== undefined) {
      patch.background = oneOf(o.background, ['dark', 'light', 'transparent'] as const, 'background')
    }
    if (o.externalApps !== undefined && Array.isArray(o.externalApps)) {
      patch.externalApps = o.externalApps.map((item) => {
        const appItem = asObject(item, 'externalApps')
        return {
          label: asString(appItem.label, 'label', 80),
          path: asString(appItem.path, 'path', 4096)
        }
      })
    }
    return setSettings(patch)
  })

  handle(IPC.statsGet, () => getStats())

  handle(IPC.appRevealUserData, () => {
    shell.openPath(app.getPath('userData'))
    return { ok: true }
  })

  handle(IPC.appChooseExternalApp, async () => {
    const win = getWindow()
    if (!win) return { path: null }
    const res = await dialog.showOpenDialog(win, {
      title: '选择外部应用',
      properties: ['openFile'],
      filters: [{ name: '应用', extensions: ['app'] }],
      defaultPath: '/Applications'
    })
    return { path: res.canceled ? null : res.filePaths[0] ?? null }
  })
}

/** 供渲染端确认某模型是否可实时预览 */
export function assertModelReadable(model: ModelAsset | null): model is ModelAsset {
  return model !== null
}
