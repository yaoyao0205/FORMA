import type {
  AppSettings,
  DuplicateGroup,
  GeometryResponse,
  ImportRequest,
  ImportResult,
  Library,
  LibraryMode,
  ModelAsset,
  PrintRecord,
  PrintStatus,
  Project,
  QueryParams,
  QueryResult,
  ScanProgress,
  Stats,
  Tag,
  Unit,
  UpdatePatch
} from './types'

export const IPC = {
  libraryList: 'library:list',
  libraryCreate: 'library:create',
  libraryUpdate: 'library:update',
  libraryRemove: 'library:remove',
  libraryPickFolder: 'library:pickFolder',
  libraryScan: 'library:scan',
  libraryScanCancel: 'library:scanCancel',
  libraryScanProgress: 'library:scan-progress',

  modelsQuery: 'models:query',
  modelsGet: 'models:get',
  modelsUpdate: 'models:update',
  modelsDelete: 'models:delete',
  modelsRestore: 'models:restore',
  modelsDuplicates: 'models:duplicates',
  modelsReveal: 'models:reveal',
  modelsOpenWith: 'models:openWith',
  modelsRevealLibrary: 'models:revealLibrary',

  importPaths: 'import:paths',
  importProgress: 'import:progress',
  modelsChanged: 'models:changed',

  geometryLoad: 'geometry:load',
  thumbnailSave: 'thumbnail:save',

  tagsList: 'tags:list',
  tagsCreate: 'tags:create',
  tagsUpdate: 'tags:update',
  tagsDelete: 'tags:delete',

  projectsList: 'projects:list',
  projectsCreate: 'projects:create',
  projectsUpdate: 'projects:update',
  projectsDelete: 'projects:delete',

  printAdd: 'print:add',
  printList: 'print:list',
  printDelete: 'print:delete',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  statsGet: 'app:stats',
  appRevealUserData: 'app:revealUserData',
  appChooseExternalApp: 'app:chooseExternalApp'
} as const

export interface PickFolderResult {
  path: string | null
  canceled: boolean
}

export interface DeleteResult {
  records: number
  files: number
}

export interface GeometryLoadRequest {
  id: string
  maxTriangles?: number
}

export interface ThumbnailSaveRequest {
  modelId: string
  dataUrl: string
}

export interface PrintAddRequest {
  modelId: string
  status: PrintStatus
  material?: string | null
  color?: string | null
  durationSeconds?: number | null
  result?: string | null
  notes?: string | null
  printedAt?: number
}

export interface CreateTagRequest {
  name: string
  color?: string
}

export interface CreateProjectRequest {
  name: string
  color?: string
}

export interface LibraryCreateRequest {
  name: string
  path?: string
  mode?: LibraryMode
}

export interface Api {
  /** 渲染进程判断窗口控制布局（macOS 交通灯留白 / Windows 无边框按钮） */
  platform: string
  library: {
    list(): Promise<Library[]>
    create(req: LibraryCreateRequest): Promise<Library>
    update(req: { id: string; patch: Partial<Pick<Library, 'name' | 'path' | 'mode' | 'watch'>> }): Promise<Library>
    remove(req: { id: string; removeRecords: boolean }): Promise<{ ok: boolean }>
    pickFolder(req?: { title?: string }): Promise<PickFolderResult>
    scan(req: { libraryId: string }): Promise<{ started: boolean }>
    cancelScan(req: { libraryId: string }): Promise<{ cancelled: boolean }>
    onScanProgress(cb: (p: ScanProgress) => void): () => void
  }
  models: {
    query(params: QueryParams): Promise<QueryResult>
    get(req: { id: string }): Promise<ModelAsset | null>
    update(req: { id: string; patch: UpdatePatch }): Promise<ModelAsset>
    remove(req: { ids: string[]; deleteFiles: boolean }): Promise<DeleteResult>
    restore(req: { ids: string[] }): Promise<{ restored: number }>
    duplicates(req?: { libraryId?: string }): Promise<DuplicateGroup[]>
    reveal(req: { id: string }): Promise<{ ok: boolean }>
    openWith(req: { id: string; appPath?: string }): Promise<{ ok: boolean; error?: string }>
  }
  importPaths(req: ImportRequest): Promise<ImportResult>
  getPathForFile(file: File): string
  onImportProgress(cb: (p: ScanProgress) => void): () => void
  onMenu(channel: 'new-library' | 'import' | 'rescan', cb: () => void): () => void
  /** 后台（如文件夹监控）改动了模型记录时通知渲染进程刷新 */
  onModelsChanged(cb: () => void): () => void
  onImportProgress(cb: (p: ScanProgress) => void): () => void
  geometry: {
    load(req: GeometryLoadRequest): Promise<GeometryResponse>
  }
  thumbnail: {
    save(req: ThumbnailSaveRequest): Promise<{ ok: boolean; path?: string }>
  }
  tags: {
    list(): Promise<Tag[]>
    create(req: CreateTagRequest): Promise<Tag>
    update(req: { id: string; patch: Partial<Pick<Tag, 'name' | 'color'>> }): Promise<Tag>
    remove(req: { id: string }): Promise<{ ok: boolean }>
  }
  projects: {
    list(): Promise<Project[]>
    create(req: CreateProjectRequest): Promise<Project>
    update(req: { id: string; patch: Partial<Pick<Project, 'name' | 'color'>> }): Promise<Project>
    remove(req: { id: string }): Promise<{ ok: boolean }>
  }
  print: {
    add(req: PrintAddRequest): Promise<PrintRecord>
    list(req: { modelId: string }): Promise<PrintRecord[]>
    remove(req: { id: string }): Promise<{ ok: boolean }>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  stats(): Promise<Stats>
  revealUserData(): Promise<{ ok: boolean }>
  chooseExternalApp(): Promise<{ path: string | null }>
  setUnit(req: { id: string; unit: Unit }): Promise<ModelAsset>
}
