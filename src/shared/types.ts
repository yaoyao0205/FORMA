export type LibraryMode = 'reference' | 'managed'
export type PrintStatus = 'none' | 'queued' | 'printed' | 'failed'
export type Unit = 'mm' | 'cm' | 'inch'
export type SortKey = 'name' | 'imported' | 'modified' | 'size' | 'triangles' | 'height'

export interface Library {
  id: string
  name: string
  path: string
  mode: LibraryMode
  watch: boolean
  createdAt: number
  updatedAt: number
  modelCount?: number
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Project {
  id: string
  name: string
  color: string
  sortOrder: number
  createdAt: number
}

export interface Bounds {
  x: number
  y: number
  z: number
}

export interface PrintRecord {
  id: string
  modelId: string
  status: PrintStatus
  material: string | null
  color: string | null
  durationSeconds: number | null
  result: string | null
  printedAt: number
  notes: string | null
}

export interface ModelAsset {
  id: string
  libraryId: string
  path: string
  filename: string
  ext: string
  size: number
  sha256: string | null
  mtime: number
  importedAt: number
  mode: LibraryMode
  bbox: Bounds | null
  unit: Unit
  unitDeclared: boolean
  vertices: number | null
  triangles: number | null
  meshCount: number | null
  volumeMm3: number | null
  closed: boolean | null
  favorite: boolean
  rating: number
  notes: string | null
  sourceUrl: string | null
  printStatus: PrintStatus
  thumbnail: string | null
  customCover: string | null
  missing: boolean
  /** 真正的解析失败原因；提示类信息放 warnings，不再混在这里 */
  parseError: string | null
  /** 解析成功但需要告知用户的情况（材质未载入、带标题、已降采样等） */
  warnings: string | null
  deletedAt: number | null
  tags: Tag[]
  projectIds: string[]
}

export interface QueryParams {
  libraryId?: string
  search?: string
  tagIds?: string[]
  projectIds?: string[]
  exts?: string[]
  favoritesOnly?: boolean
  missingOnly?: boolean
  uncategorizedOnly?: boolean
  recentDays?: number
  includeDeleted?: boolean
  sort?: SortKey
  direction?: 'asc' | 'desc'
  offset?: number
  limit?: number
  printStatus?: PrintStatus
}

export interface QueryResult {
  rows: ModelAsset[]
  total: number
}

export interface ImportRequest {
  libraryId: string
  paths: string[]
  mode?: LibraryMode
}

export interface ImportResult {
  imported: number
  duplicates: number
  failed: number
  cancelled: boolean
  errors: string[]
  /** 源文件内容变化、旧缩略图已作废的模型 id，界面据此重新排队渲染 */
  rethumb?: string[]
}

export interface ScanProgress {
  libraryId: string
  phase: 'discover' | 'parse' | 'dedupe' | 'done' | 'cancelled'
  done: number
  total: number
  currentFile?: string
}

export interface GeometryPayload {
  positions: Float32Array
  indices: Uint32Array
  normals?: Float32Array
  bounds: Bounds
  unit: Unit
  unitDeclared: boolean
  vertices: number
  triangles: number
  meshCount: number
  warnings: string[]
}

export interface GeometryResponse {
  ok: boolean
  geometry?: GeometryPayload
  error?: string
}

export interface DuplicateGroup {
  sha256: string
  models: ModelAsset[]
}

export interface Stats {
  count: number
  bytes: number
  byExt: Record<string, number>
  missing: number
}

export interface AppSettings {
  defaultUnit: Unit
  externalApps: { label: string; path: string }[]
  gridDensity: 'compact' | 'cozy' | 'roomy'
  background: 'dark' | 'light' | 'transparent'
}

export interface UpdatePatch {
  favorite?: boolean
  rating?: number
  notes?: string | null
  sourceUrl?: string | null
  unit?: Unit
  printStatus?: PrintStatus
  customCover?: string | null
  tags?: string[]
  projectIds?: string[]
}
