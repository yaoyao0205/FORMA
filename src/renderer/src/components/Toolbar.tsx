import type { ReactElement } from 'react'
import { useEffect, useRef } from 'react'
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  Grid2X2,
  List,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Upload,
  X
} from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { useApp, type SidebarKey } from '@renderer/store/useApp'
import type { SortKey } from '@shared/types'
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from './ui/overlay'
import { Button, IconButton, Input, Segmented, Tooltip } from './ui/kit'

const SORT_LABELS: Record<SortKey, string> = {
  imported: '导入时间',
  name: '名称',
  modified: '修改时间',
  size: '文件大小',
  triangles: '面数',
  height: '高度'
}

const EXT_LABELS: Record<string, string> = { stl: 'STL', obj: 'OBJ', '3mf': '3MF', glb: 'GLB', gltf: 'GLTF' }

function viewTitle(
  sidebar: SidebarKey,
  tags: { id: string; name: string }[],
  projects: { id: string; name: string }[]
): string {
  if (sidebar.startsWith('tag:')) {
    const id = sidebar.slice(4)
    return tags.find((t) => t.id === id)?.name ?? '标签'
  }
  if (sidebar.startsWith('project:')) {
    const id = sidebar.slice(8)
    return projects.find((p) => p.id === id)?.name ?? '项目'
  }
  if (sidebar.startsWith('library:')) return '模型库'
  const map: Record<string, string> = {
    all: '全部模型',
    favorites: '收藏',
    recent: '最近导入',
    uncategorized: '未分类',
    missing: '文件丢失',
    duplicates: '重复项'
  }
  return map[sidebar] ?? '全部模型'
}

export function Toolbar({
  compact,
  onToggleDensity,
  sidebarCollapsed,
  onToggleSidebar,
  inspectorOpen,
  onToggleInspector
}: {
  compact: boolean
  onToggleDensity: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  inspectorOpen: boolean
  onToggleInspector: () => void
}): ReactElement {
  const search = useApp((s) => s.search)
  const setSearch = useApp((s) => s.setSearch)
  const sort = useApp((s) => s.sort)
  const setSort = useApp((s) => s.setSort)
  const exts = useApp((s) => s.exts)
  const setExts = useApp((s) => s.setExts)
  const filterTagIds = useApp((s) => s.filterTagIds)
  const toggleFilterTag = useApp((s) => s.toggleFilterTag)
  const clearFilters = useApp((s) => s.clearFilters)
  const total = useApp((s) => s.total)
  const loading = useApp((s) => s.loading)
  const sidebar = useApp((s) => s.sidebar)
  const tags = useApp((s) => s.tags)
  const projects = useApp((s) => s.projects)
  const importViaDialog = useApp((s) => s.importViaDialog)
  const rescan = useApp((s) => s.rescan)
  const scan = useApp((s) => s.scan)
  const libraries = useApp((s) => s.libraries)
  const activeLibraryId = useApp((s) => s.activeLibraryId)
  const openLibraryDialog = useApp((s) => s.openLibraryDialog)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggleExt = (ext: string): void => {
    setExts(exts.includes(ext) ? exts.filter((x) => x !== ext) : [...exts, ext])
  }

  const hasLibrary = Boolean(activeLibraryId)
  const activeFilterCount = exts.length + filterTagIds.length + (search ? 1 : 0)

  return (
    <header className="shrink-0">
      <div className="drag-region flex h-14 items-center gap-2 border-b border-white/[0.055] bg-base-900 px-3">
        <Tooltip content={sidebarCollapsed ? '展开导航栏 (⌘B)' : '收起导航栏 (⌘B)'}>
          <button
            type="button"
            onClick={onToggleSidebar}
            className="no-drag grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-500 transition-colors hover:bg-white/[0.06] hover:text-ink-100"
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </Tooltip>

        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink-100">
            {viewTitle(sidebar, tags, projects)}
          </h1>
          <span className="shrink-0 rounded-full bg-white/[0.05] px-1.5 py-[1px] tabular text-[10.5px] text-ink-400">
            {loading ? '…' : total}
          </span>
        </div>

        <div className="relative no-drag ml-2 min-w-[160px] max-w-[360px] flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索名称、标签、备注…"
            className="h-8 bg-base-850 pl-8 pr-12 text-xs placeholder:text-ink-500"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="no-drag absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-500 hover:text-ink-100"
            >
              <X size={12} />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-white/[0.08] bg-white/[0.03] px-1 py-[1px] text-[10px] text-ink-500">
              ⌘F
            </kbd>
          )}
        </div>

        <div className="no-drag flex shrink-0 items-center gap-1">
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-ink-400 hover:text-ink-100">
                <Filter size={13} />
                <span className="hidden lg:inline">格式</span>
                {exts.length > 0 ? (
                  <span className="rounded bg-accent/15 px-1 tabular text-[10px] text-accent">{exts.length}</span>
                ) : null}
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end">
              <DropdownLabel>文件格式</DropdownLabel>
              {['stl', 'obj', '3mf'].map((ext) => (
                <DropdownItem key={ext} onSelect={() => toggleExt(ext)}>
                  <span
                    className={cn(
                      'grid h-3.5 w-3.5 place-items-center rounded-[3px] border',
                      exts.includes(ext) ? 'border-accent/50 bg-accent/15' : 'border-white/15'
                    )}
                  >
                    {exts.includes(ext) ? <Check size={10} className="text-accent" /> : null}
                  </span>
                  {EXT_LABELS[ext]}
                </DropdownItem>
              ))}
              {exts.length > 0 ? (
                <>
                  <DropdownSeparator />
                  <DropdownItem onSelect={() => setExts([])}>清除格式筛选</DropdownItem>
                </>
              ) : null}
            </DropdownContent>
          </Dropdown>

          {tags.length > 0 ? (
            <Dropdown>
              <DropdownTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-ink-400 hover:text-ink-100">
                  <Plus size={13} />
                  <span className="hidden lg:inline">标签</span>
                  {filterTagIds.length > 0 ? (
                    <span className="rounded bg-accent/15 px-1 tabular text-[10px] text-accent">
                      {filterTagIds.length}
                    </span>
                  ) : null}
                </Button>
              </DropdownTrigger>
              <DropdownContent align="end">
                <DropdownLabel>按标签筛选</DropdownLabel>
                <div className="max-h-[280px] overflow-y-auto">
                  {tags.map((t) => (
                    <DropdownItem key={t.id} onSelect={() => toggleFilterTag(t.id)}>
                      <span
                        className={cn(
                          'grid h-3.5 w-3.5 place-items-center rounded-[3px] border',
                          filterTagIds.includes(t.id) ? 'border-accent/50 bg-accent/15' : 'border-white/15'
                        )}
                      >
                        {filterTagIds.includes(t.id) ? <Check size={10} className="text-accent" /> : null}
                      </span>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </DropdownItem>
                  ))}
                </div>
                {filterTagIds.length > 0 ? (
                  <>
                    <DropdownSeparator />
                    <DropdownItem onSelect={() => filterTagIds.forEach((id) => toggleFilterTag(id))}>
                      清除标签筛选
                    </DropdownItem>
                  </>
                ) : null}
              </DropdownContent>
            </Dropdown>
          ) : null}

          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-ink-400 hover:text-ink-100">
                <ArrowUpDown size={13} />
                <span className="hidden xl:inline">{SORT_LABELS[sort]}</span>
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end">
              <DropdownLabel>排序方式</DropdownLabel>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <DropdownItem key={key} onSelect={() => setSort(key)}>
                  <span className="w-3.5">{sort === key ? <Check size={12} className="text-accent" /> : null}</span>
                  {SORT_LABELS[key]}
                </DropdownItem>
              ))}
            </DropdownContent>
          </Dropdown>

          <Segmented
            value={compact ? 'list' : 'grid'}
            onChange={(v) => {
              // 只在真正切换时触发，避免点击当前激活项又切走
              if ((v === 'list') !== compact) onToggleDensity()
            }}
            options={[
              { value: 'grid', label: <Grid2X2 size={13} />, title: '网格视图' },
              { value: 'list', label: <List size={13} />, title: '紧凑列表' }
            ]}
            className="ml-0.5 bg-base-850"
          />

          <Tooltip content={inspectorOpen ? '收起检查器 (⌘I)' : '打开检查器 (⌘I)'}>
            <button
              type="button"
              onClick={onToggleInspector}
              className={cn(
                'no-drag grid h-7 w-7 place-items-center rounded-md transition-colors',
                inspectorOpen ? 'text-accent bg-white/[0.06]' : 'text-ink-500 hover:bg-white/[0.06] hover:text-ink-100'
              )}
            >
              <SlidersHorizontal size={14} />
            </button>
          </Tooltip>

          <div className="mx-1 h-4 w-px bg-white/[0.08]" />

          <IconButton
            icon={scan?.active ? <Loader2 size={14} className="animate-spin text-accent" /> : <RefreshCw size={14} />}
            label="重新扫描当前库"
            onClick={() => void rescan()}
            disabled={!hasLibrary}
          />

          {libraries.length === 0 ? (
            <Button variant="accent" size="sm" className="gap-1.5" onClick={() => openLibraryDialog()}>
              <Plus size={13} /> 新建模型库
            </Button>
          ) : (
            <Button variant="accent" size="sm" className="gap-1.5" onClick={() => void importViaDialog()}>
              <Upload size={13} /> 导入
            </Button>
          )}
        </div>
      </div>

      {activeFilterCount > 0 ? (
        <div className="flex h-8 items-center gap-1.5 overflow-x-auto border-b border-white/[0.045] bg-base-900/60 px-3 no-drag">
          <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-ink-500">筛选</span>
          {search ? (
            <FilterChip label={`“${search}”`} onClick={() => setSearch('')} />
          ) : null}
          {exts.map((ext) => (
            <FilterChip key={ext} label={EXT_LABELS[ext] ?? ext.toUpperCase()} onClick={() => toggleExt(ext)} />
          ))}
          {filterTagIds.length >= 2 ? (
            <span className="shrink-0 text-[9.5px] text-ink-500" title="多个标签为交集：只显示同时带有这些标签的模型">
              标签同时满足
            </span>
          ) : null}
          {filterTagIds.map((id, i) => {
            const tag = tags.find((t) => t.id === id)
            return (
              <span key={id} className="flex shrink-0 items-center gap-1.5">
                {i > 0 ? <span className="text-[10px] text-ink-600">∩</span> : null}
                <FilterChip label={tag?.name ?? '标签'} dot={tag?.color} onClick={() => toggleFilterTag(id)} />
              </span>
            )
          })}
          <button
            type="button"
            onClick={clearFilters}
            className="ml-1 shrink-0 rounded px-1.5 py-[2px] text-[10.5px] text-ink-500 transition-colors hover:text-ink-200"
          >
            清除全部
          </button>
        </div>
      ) : null}
    </header>
  )
}

function FilterChip({
  label,
  dot,
  onClick
}: {
  label: string
  dot?: string
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex shrink-0 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-[2px] text-[10.5px] text-ink-300 transition-colors hover:border-white/20 hover:text-ink-100"
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} /> : null}
      <span className="max-w-[160px] truncate">{label}</span>
      <X size={10} className="text-ink-500 group-hover:text-ink-100" />
    </button>
  )
}
