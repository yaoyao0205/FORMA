import { create } from 'zustand'
import type {
  AppSettings,
  DuplicateGroup,
  Library,
  ModelAsset,
  PrintRecord,
  PrintStatus,
  Project,
  QueryParams,
  SortKey,
  Stats,
  Tag,
  UpdatePatch
} from '@shared/types'
import { errorMessage, forma } from '@renderer/lib/api'

export type SidebarKey =
  | 'all'
  | 'favorites'
  | 'recent'
  | 'uncategorized'
  | 'missing'
  | 'duplicates'
  | `library:${string}`
  | `project:${string}`
  | `tag:${string}`

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error' | 'success'
}

export interface ScanStatus {
  active: boolean
  phase: string
  done: number
  total: number
  currentFile?: string
}

interface AppState {
  libraries: Library[]
  activeLibraryId: string | null
  models: ModelAsset[]
  total: number
  loading: boolean
  search: string
  sort: SortKey
  direction: 'asc' | 'desc'
  exts: string[]
  sidebar: SidebarKey
  selected: Set<string>
  focusId: string | null
  tags: Tag[]
  projects: Project[]
  settings: AppSettings
  stats: Stats | null
  scan: ScanStatus | null
  toasts: Toast[]
  duplicates: DuplicateGroup[]

  init: () => Promise<void>
  refresh: (opts?: { append?: boolean }) => Promise<void>
  /** 滚动到底部时按 offset 追加下一页，突破单次 500 条的上限 */
  loadMore: () => Promise<void>
  /** 新建库对话框（替代渲染进程中不可用的 window.prompt） */
  libraryDialogOpen: boolean
  openLibraryDialog: () => void
  closeLibraryDialog: () => void
  /** 通用文本输入对话框（新建项目等），返回 Promise 以便调用点直接 await */
  nameDialog: { title: string; initial: string; placeholder: string } | null
  askName: (opts: { title: string; initial?: string; placeholder?: string }) => Promise<string | null>
  submitNameDialog: (value: string | null) => void
  setSearch: (q: string) => void
  setSort: (sort: SortKey) => void
  setSidebar: (key: SidebarKey) => void
  setExts: (exts: string[]) => void
  /** 工具栏的多标签筛选，与侧栏选中的 tag 组合生效 */
  filterTagIds: string[]
  toggleFilterTag: (id: string) => void
  clearFilters: () => void
  selectLibrary: (id: string) => void
  setFocus: (id: string | null) => void
  toggleSelect: (id: string, additive: boolean) => void
  selectMany: (ids: string[]) => void
  clearSelection: () => void
  selectAllVisible: () => void

  reloadTaxonomy: () => Promise<void>
  updateModel: (id: string, patch: UpdatePatch) => Promise<void>
  patchModelLocal: (id: string, patch: Partial<ModelAsset>) => void
  toggleFavorite: (id: string) => Promise<void>
  addTag: (name: string, modelIds?: string[]) => Promise<Tag | null>
  attachTag: (tagId: string, modelIds: string[]) => Promise<void>
  detachTag: (tagId: string, modelIds: string[]) => Promise<void>
  createProject: (name: string) => Promise<void>
  attachProject: (projectId: string, modelIds: string[]) => Promise<void>

  importPaths: (paths: string[]) => Promise<void>
  importViaDialog: () => Promise<void>
  rescan: () => Promise<void>
  cancelScan: () => Promise<void>

  deleteSelection: (deleteFiles: boolean) => Promise<void>
  /** 按 id 精确删除；右键菜单和批量操作都走这里，避免误删全局选中项 */
  deleteModels: (ids: string[], deleteFiles: boolean) => Promise<void>
  revealModel: (id: string) => Promise<void>
  openModel: (id: string, appPath?: string) => Promise<void>

  addPrintRecord: (modelId: string, status: PrintStatus, extra?: Partial<PrintRecord>) => Promise<void>
  pushToast: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
  createLibrary: (name: string, path: string, mode: 'reference' | 'managed') => Promise<Library | null>
  setLibraryWatch: (id: string, watch: boolean) => Promise<void>
  /** 切换界面主题（深色 / 浅色 / 跟随系统），持久化到 app_settings */
  setTheme: (theme: AppSettings['theme']) => Promise<void>
  pickFolder: (title?: string) => Promise<string | null>
}

/** 单页条数；超过此数量的库靠 loadMore 追加 */
const PAGE_SIZE = 500

const DEFAULT_SETTINGS: AppSettings = {
  defaultUnit: 'mm',
  externalApps: [],
  gridDensity: 'cozy',
  background: 'dark',
  theme: 'dark'
}

let searchTimer: number | undefined
let toastSeq = 1
/** askName 的挂起回调：对话框关闭时把输入结果交还调用点 */
let pendingNameResolver: ((value: string | null) => void) | null = null

function sidebarQuery(
  sidebar: SidebarKey,
  activeLibraryId: string | null,
  filterTagIds: string[] = []
): QueryParams {
  const base: QueryParams = (() => {
    if (sidebar.startsWith('library:')) return { libraryId: sidebar.slice('library:'.length) }
    if (sidebar.startsWith('project:')) return { projectIds: [sidebar.slice('project:'.length)] }
    if (sidebar.startsWith('tag:')) return { tagIds: [sidebar.slice('tag:'.length)] }
    switch (sidebar) {
      case 'favorites':
        return { favoritesOnly: true, libraryId: activeLibraryId ?? undefined }
      case 'recent':
        return { recentDays: 7, libraryId: activeLibraryId ?? undefined }
      case 'uncategorized':
        return { uncategorizedOnly: true, libraryId: activeLibraryId ?? undefined }
      case 'missing':
        return { missingOnly: true, libraryId: activeLibraryId ?? undefined }
      case 'duplicates':
        return { libraryId: activeLibraryId ?? undefined }
      default:
        return { libraryId: activeLibraryId ?? undefined }
    }
  })()

  if (filterTagIds.length === 0) return base
  const merged = Array.from(new Set([...(base.tagIds ?? []), ...filterTagIds]))
  return { ...base, tagIds: merged }
}

export const useApp = create<AppState>((set, get) => ({
  libraries: [],
  activeLibraryId: null,
  models: [],
  total: 0,
  loading: false,
  search: '',
  sort: 'imported',
  direction: 'desc',
  exts: [],
  filterTagIds: [],
  sidebar: 'all',
  selected: new Set<string>(),
  focusId: null,
  tags: [],
  projects: [],
  settings: DEFAULT_SETTINGS,
  stats: null,
  scan: null,
  toasts: [],
  duplicates: [],

  init: async () => {
    try {
      const [libraries, tags, projects, settings, stats] = await Promise.all([
        forma.libraries.list(),
        forma.tags.list(),
        forma.projects.list(),
        forma.settings.get(),
        forma.stats()
      ])
      set({
        libraries,
        tags,
        projects,
        settings,
        stats,
        activeLibraryId: libraries[0]?.id ?? null,
        sidebar: 'all'
      })
      await get().refresh()

      forma.onImportProgress((p) => {
        if (p.phase === 'done' || p.phase === 'cancelled') {
          set({ scan: null })
          void get().refresh()
          void forma.stats().then((s) => set({ stats: s }))
        } else {
          set({
            scan: {
              active: true,
              phase: p.phase,
              done: p.done,
              total: p.total,
              currentFile: p.currentFile
            }
          })
        }
      })

      // 文件夹监控发现文件消失/回归时，主进程会推这条消息，界面跟着刷新
      forma.onModelsChanged(() => {
        void get().refresh()
        void forma.stats().then((s) => set({ stats: s }))
      })
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  refresh: async () => {
    const s = get()
    set({ loading: true })
    try {
      if (s.sidebar === 'duplicates') {
        const groups = await forma.models.duplicates({ libraryId: s.activeLibraryId ?? undefined })
        set({ duplicates: groups, loading: false, total: groups.reduce((n, g) => n + g.models.length, 0) })
        return
      }
      const base = sidebarQuery(s.sidebar, s.activeLibraryId, s.filterTagIds)
      const result = await forma.models.query({
        ...base,
        search: s.search,
        exts: s.exts,
        sort: s.sort,
        direction: s.direction,
        offset: 0,
        limit: PAGE_SIZE
      })
      set({ models: result.rows, total: result.total, loading: false })
      void forma.stats().then((stats) => set({ stats }))
    } catch (error) {
      set({ loading: false })
      get().pushToast(errorMessage(error), 'error')
    }
  },

  loadMore: async () => {
    const s = get()
    if (s.sidebar === 'duplicates' || s.loading) return
    // 已经是最后一页就不再请求，避免滚动到底反复查询
    if (s.models.length >= s.total) return
    const base = sidebarQuery(s.sidebar, s.activeLibraryId, s.filterTagIds)
    try {
      const result = await forma.models.query({
        ...base,
        search: s.search,
        exts: s.exts,
        sort: s.sort,
        direction: s.direction,
        offset: s.models.length,
        limit: PAGE_SIZE
      })
      set((prev) => ({
        models: [...prev.models, ...result.rows],
        total: result.total
      }))
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  libraryDialogOpen: false,
  openLibraryDialog: () => set({ libraryDialogOpen: true }),
  closeLibraryDialog: () => set({ libraryDialogOpen: false }),

  nameDialog: null,
  askName: (opts) =>
    new Promise<string | null>((resolve) => {
      pendingNameResolver = resolve
      set({
        nameDialog: {
          title: opts.title,
          initial: opts.initial ?? '',
          placeholder: opts.placeholder ?? ''
        }
      })
    }),
  submitNameDialog: (value) => {
    set({ nameDialog: null })
    const resolve = pendingNameResolver
    pendingNameResolver = null
    resolve?.(value)
  },

  setSearch: (q) => {
    set({ search: q })
    if (searchTimer) window.clearTimeout(searchTimer)
    searchTimer = window.setTimeout(() => {
      void get().refresh()
    }, 220)
  },

  setSort: (sort) => {
    set({ sort, direction: sort === 'name' ? 'asc' : 'desc' })
    void get().refresh()
  },

  setSidebar: (key) => {
    set({ sidebar: key, selected: new Set<string>(), focusId: null })
    const lib = key.startsWith('library:') ? key.slice('library:'.length) : get().activeLibraryId
    set({ activeLibraryId: lib })
    void get().refresh()
  },

  setExts: (exts) => {
    set({ exts })
    void get().refresh()
  },

  toggleFilterTag: (id) => {
    const cur = get().filterTagIds
    set({ filterTagIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] })
    void get().refresh()
  },

  clearFilters: () => {
    set({ search: '', exts: [], filterTagIds: [] })
    if (searchTimer) window.clearTimeout(searchTimer)
    void get().refresh()
  },

  selectLibrary: (id) => {
    set({ activeLibraryId: id, sidebar: 'all', selected: new Set<string>(), focusId: null })
    void get().refresh()
  },

  setFocus: (id) => {
    set({ focusId: id, selected: id ? new Set([id]) : new Set<string>() })
  },

  toggleSelect: (id, additive) => {
    const current = get().selected
    if (!additive) {
      set({ selected: new Set([id]), focusId: id })
      return
    }
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({ selected: next, focusId: id })
  },

  selectMany: (ids) => set({ selected: new Set(ids), focusId: ids[ids.length - 1] ?? null }),
  clearSelection: () => set({ selected: new Set<string>(), focusId: null }),
  selectAllVisible: () => set({ selected: new Set(get().models.map((m) => m.id)) }),

  reloadTaxonomy: async () => {
    const [tags, projects] = await Promise.all([forma.tags.list(), forma.projects.list()])
    set({ tags, projects })
  },

  updateModel: async (id, patch) => {
    try {
      const updated = await forma.models.update({ id, patch })
      set((s) => ({
        models: s.models.map((m) => (m.id === id ? updated : m)),
        selected: s.selected
      }))
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  patchModelLocal: (id, patch) => {
    set((s) => ({
      models: s.models.map((m) => (m.id === id ? { ...m, ...patch } : m))
    }))
  },

  toggleFavorite: async (id) => {
    const model = get().models.find((m) => m.id === id)
    if (!model) return
    const next = !model.favorite
    get().patchModelLocal(id, { favorite: next })
    try {
      await forma.models.update({ id, patch: { favorite: next } })
    } catch (error) {
      get().patchModelLocal(id, { favorite: !next })
      get().pushToast(errorMessage(error), 'error')
    }
  },

  addTag: async (name, modelIds) => {
    const clean = name.trim()
    if (!clean) return null
    try {
      const tag = await forma.tags.create({ name: clean })
      await get().reloadTaxonomy()
      if (modelIds && modelIds.length > 0) {
        await get().attachTag(tag.id, modelIds)
      }
      return tag
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
      return null
    }
  },

  attachTag: async (tagId, modelIds) => {
    const targets = get().models.filter((m) => modelIds.includes(m.id))
    for (const m of targets) {
      if (m.tags.some((t) => t.id === tagId)) continue
      await get().updateModel(m.id, { tags: [...m.tags.map((t) => t.id), tagId] })
    }
  },

  detachTag: async (tagId, modelIds) => {
    const targets = get().models.filter((m) => modelIds.includes(m.id))
    for (const m of targets) {
      await get().updateModel(m.id, { tags: m.tags.filter((t) => t.id !== tagId).map((t) => t.id) })
    }
  },

  createProject: async (name) => {
    try {
      await forma.projects.create({ name })
      await get().reloadTaxonomy()
      get().pushToast('项目已创建', 'success')
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  attachProject: async (projectId, modelIds) => {
    const targets = get().models.filter((m) => modelIds.includes(m.id))
    for (const m of targets) {
      if (m.projectIds.includes(projectId)) continue
      await get().updateModel(m.id, { projectIds: [...m.projectIds, projectId] })
    }
  },

  importPaths: async (paths) => {
    const libraryId = get().activeLibraryId
    if (!libraryId) {
      get().pushToast('先创建一个模型库', 'error')
      return
    }
    if (paths.length === 0) return
    try {
      const result = await forma.importPaths({ libraryId, paths })
      await get().refresh()
      void forma.stats().then((s) => set({ stats: s }))
      const parts: string[] = []
      if (result.imported > 0) parts.push(`导入 ${result.imported}`)
      if (result.duplicates > 0) parts.push(`重复 ${result.duplicates}`)
      if (result.failed > 0) parts.push(`失败 ${result.failed}`)
      get().pushToast(
        result.cancelled ? '导入已取消' : `导入完成：${parts.join('，') || '没有新文件'}`,
        result.failed > 0 ? 'error' : 'success'
      )
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  importViaDialog: async () => {
    const folder = await get().pickFolder('选择要导入的模型文件夹')
    if (folder) await get().importPaths([folder])
  },

  rescan: async () => {
    const libraryId = get().activeLibraryId
    if (!libraryId) return
    try {
      await forma.libraries.scan({ libraryId })
      set({ scan: { active: true, phase: 'discover', done: 0, total: 0 } })
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  cancelScan: async () => {
    const libraryId = get().activeLibraryId
    if (!libraryId) return
    await forma.libraries.cancelScan({ libraryId })
  },

  deleteSelection: async (deleteFiles) => {
    // 只作用于当前列表里可见的选中项：切换筛选后 selected 里可能还残留
    // 已经不在列表中的 id，直接按全局集合删会连带删掉看不见的模型。
    const visible = get()
      .models.filter((m) => get().selected.has(m.id))
      .map((m) => m.id)
    await get().deleteModels(visible, deleteFiles)
  },

  deleteModels: async (ids, deleteFiles) => {
    if (ids.length === 0) return
    try {
      const result = await forma.models.remove({ ids, deleteFiles })
      set((s) => {
        const next = new Set(s.selected)
        for (const id of ids) next.delete(id)
        return {
          selected: next,
          focusId: s.focusId && ids.includes(s.focusId) ? null : s.focusId
        }
      })
      await get().refresh()
      void forma.stats().then((s) => set({ stats: s }))
      get().pushToast(
        deleteFiles
          ? `已移入废纸篓 ${result.files} 个文件（记录 ${result.records} 条）`
          : `已从库中移除 ${result.records} 条记录，原始文件保留`,
        'success'
      )
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  revealModel: async (id) => {
    await forma.models.reveal({ id })
  },

  openModel: async (id, appPath) => {
    const res = await forma.models.openWith({ id, appPath })
    if (!res.ok) get().pushToast(res.error ?? '打开失败', 'error')
  },

  addPrintRecord: async (modelId, status, extra) => {
    try {
      await forma.print.add({
        modelId,
        status,
        material: extra?.material ?? null,
        color: extra?.color ?? null,
        durationSeconds: extra?.durationSeconds ?? null,
        result: extra?.result ?? null,
        notes: extra?.notes ?? null
      })
      await forma.models.update({ id: modelId, patch: { printStatus: status } })
      await get().refresh()
      get().pushToast('打印记录已保存', 'success')
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  pushToast: (text, kind = 'info') => {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    window.setTimeout(() => get().dismissToast(id), 4200)
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  createLibrary: async (name, path, mode) => {
    try {
      const lib = await forma.libraries.create({ name, path, mode })
      const libraries = await forma.libraries.list()
      set({ libraries, activeLibraryId: lib.id, sidebar: 'all' })
      await get().refresh()
      return lib
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
      return null
    }
  },

  setLibraryWatch: async (id, watch) => {
    try {
      await forma.libraries.update({ id, patch: { watch } })
      const libraries = await forma.libraries.list()
      set({ libraries })
      get().pushToast(watch ? '已开启文件夹监控：新增或更新的模型会自动入库' : '已关闭文件夹监控', 'success')
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  setTheme: async (theme) => {
    try {
      const settings = await forma.settings.set({ theme })
      set({ settings })
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  pickFolder: async (title) => {
    const res = await forma.libraries.pickFolder({ title })
    return res.path
  }
}))
