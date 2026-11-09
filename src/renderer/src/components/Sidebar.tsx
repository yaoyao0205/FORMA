import type { ReactElement, ReactNode } from 'react'
import { useMemo } from 'react'
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FolderKanban,
  FolderPlus,
  FolderSync,
  HardDrive,
  Layers,
  Plus,
  Settings2,
  Star,
  Upload
} from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { useApp, type SidebarKey } from '@renderer/store/useApp'
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from './ui/overlay'
import { IconButton, Tooltip } from './ui/kit'

const IS_MAC = typeof window !== 'undefined' && window.forma.platform === 'darwin'

function NavItem({
  icon,
  label,
  count,
  active,
  collapsed,
  onClick
}: {
  icon: ReactNode
  label: string
  count?: number
  active: boolean
  collapsed?: boolean
  onClick: () => void
}): ReactElement {
  const button = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'no-drag group relative flex w-full items-center rounded-md text-left transition-colors duration-150',
        collapsed ? 'h-8 justify-center' : 'h-7 gap-2.5 px-2',
        active
          ? 'bg-white/[0.06] text-ink-100'
          : 'text-ink-300 hover:bg-white/[0.035] hover:text-ink-100'
      )}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent" />
      ) : null}
      <span className={cn('shrink-0 transition-colors', active ? 'text-accent' : 'text-ink-500 group-hover:text-ink-300')}>
        {icon}
      </span>
      {collapsed ? null : (
        <>
          <span className="flex-1 truncate text-xs">{label}</span>
          {typeof count === 'number' && count > 0 ? (
            <span className="shrink-0 tabular text-2xs text-ink-500">{count}</span>
          ) : null}
        </>
      )}
    </button>
  )
  return collapsed ? <Tooltip content={label}>{button}</Tooltip> : button
}

function GroupLabel({ children, action }: { children: ReactNode; action?: ReactNode }): ReactElement {
  return (
    <div className="flex h-6 items-center justify-between px-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-500">{children}</span>
      {action}
    </div>
  )
}

export function Sidebar({
  collapsed,
  onToggleCollapse
}: {
  collapsed: boolean
  onToggleCollapse: () => void
}): ReactElement {
  const libraries = useApp((s) => s.libraries)
  const activeLibraryId = useApp((s) => s.activeLibraryId)
  const sidebar = useApp((s) => s.sidebar)
  const stats = useApp((s) => s.stats)
  const tags = useApp((s) => s.tags)
  const projects = useApp((s) => s.projects)
  const setSidebar = useApp((s) => s.setSidebar)
  const selectLibrary = useApp((s) => s.selectLibrary)
  const setLibraryWatch = useApp((s) => s.setLibraryWatch)
  const importViaDialog = useApp((s) => s.importViaDialog)

  const activeLibrary = useMemo(
    () => libraries.find((l) => l.id === activeLibraryId) ?? null,
    [libraries, activeLibraryId]
  )

  const isActive = (key: SidebarKey): boolean => sidebar === key

  const navItems: { key: SidebarKey; icon: ReactNode; label: string; count?: number }[] = [
    { key: 'all', icon: <Boxes size={14} />, label: '全部模型', count: stats?.count },
    { key: 'recent', icon: <Clock3 size={14} />, label: '最近导入' },
    { key: 'favorites', icon: <Star size={14} />, label: '收藏' },
    { key: 'uncategorized', icon: <Layers size={14} />, label: '未分类' },
    { key: 'missing', icon: <AlertTriangle size={14} />, label: '文件丢失', count: stats?.missing },
    { key: 'duplicates', icon: <Copy size={14} />, label: '重复项' }
  ]

  return (
    <aside
      className={cn(
        'relative flex shrink-0 flex-col border-r border-white/[0.055] bg-base-850',
        'transition-[width] duration-200 studio-ease'
      )}
      style={{ width: collapsed ? 56 : 224 }}
    >
      {/* 顶部留白与系统窗口控制：macOS 交通灯占 16..80，折叠态把按钮下移避开 */}
      <div
        className="drag-region flex h-14 shrink-0 items-center pr-2"
        style={{ paddingLeft: IS_MAC ? 78 : 10 }}
      >
        {collapsed ? null : (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="grid h-[20px] w-[20px] place-items-center rounded-[5px] bg-accent text-[10px] font-bold text-base-950">
                F
              </div>
              <span className="truncate text-xs font-semibold tracking-[0.18em] text-ink-100">FORMA</span>
            </div>
            <IconButton
              size="sm"
              icon={<ChevronLeft size={13} />}
              label="收起导航栏 (⌘B)"
              onClick={onToggleCollapse}
              className="shrink-0"
            />
          </>
        )}
      </div>

      {collapsed ? (
        <div className="flex justify-center pb-1">
          <IconButton
            size="sm"
            icon={<ChevronRight size={13} />}
            label="展开导航栏 (⌘B)"
            onClick={onToggleCollapse}
          />
        </div>
      ) : null}

      {/* 模型库切换器 */}
      {collapsed ? (
        <div className="flex justify-center pb-2 pt-1">
          <Tooltip content={activeLibrary?.name ?? '未选择模型库'}>
            <button
              type="button"
              onClick={() => {
                const first = libraries[0]
                if (first) selectLibrary(first.id)
              }}
              className="no-drag grid h-7 w-7 place-items-center rounded-md text-ink-400 hover:bg-white/[0.06] hover:text-ink-100"
            >
              <HardDrive size={14} />
            </button>
          </Tooltip>
        </div>
      ) : (
        <div className="px-2 pb-2">
          <Dropdown>
            <DropdownTrigger asChild>
              <button
                type="button"
                className="no-drag flex h-8 w-full items-center gap-2 rounded-md border border-white/[0.06] bg-base-800/60 px-2 text-left transition-colors hover:border-white/[0.14] hover:bg-base-800"
              >
                <HardDrive size={13} className="shrink-0 text-ink-500" />
                <span className="flex-1 truncate text-[11.5px] text-ink-200">
                  {activeLibrary?.name ?? '未选择模型库'}
                </span>
                <ChevronDown size={12} className="shrink-0 text-ink-500" />
              </button>
            </DropdownTrigger>
            <DropdownContent align="start" className="w-[220px]">
              <DropdownLabel>模型库</DropdownLabel>
              {libraries.length === 0 ? (
                <DropdownItem onSelect={() => window.dispatchEvent(new CustomEvent('forma:new-library'))}>
                  <FolderPlus size={13} /> 创建第一个模型库
                </DropdownItem>
              ) : (
                libraries.map((lib) => (
                  <DropdownItem key={lib.id} onSelect={() => selectLibrary(lib.id)}>
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        lib.id === activeLibraryId ? 'bg-accent' : 'bg-white/20'
                      )}
                    />
                    <span className="flex-1 truncate">{lib.name}</span>
                    {lib.watch ? (
                      <FolderSync size={11} className="shrink-0 text-accent/70" />
                    ) : null}
                    <span className="text-[10px] text-ink-500">{lib.mode === 'managed' ? '托管' : '引用'}</span>
                  </DropdownItem>
                ))
              )}
              {activeLibrary ? (
                <>
                  <DropdownSeparator />
                  <DropdownItem onSelect={() => void setLibraryWatch(activeLibrary.id, !activeLibrary.watch)}>
                    <FolderSync size={13} />
                    <span className="flex-1">文件夹监控</span>
                    <span className={cn('text-[10px]', activeLibrary.watch ? 'text-accent' : 'text-ink-500')}>
                      {activeLibrary.watch ? '已开启' : '已关闭'}
                    </span>
                  </DropdownItem>
                </>
              ) : null}
              <DropdownSeparator />
              <DropdownItem onSelect={() => void importViaDialog()}>
                <Upload size={13} /> 导入模型…
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      )}

      <nav className={cn('flex-1 overflow-y-auto pb-3', collapsed ? 'space-y-1 px-2 pt-1' : 'space-y-4 px-2 pt-2')}>
        <div className="space-y-0.5">
          {collapsed ? null : <GroupLabel>资料库</GroupLabel>}
          {navItems.map((item) => (
            <NavItem
              key={item.key}
              icon={item.icon}
              label={item.label}
              count={item.count}
              active={isActive(item.key)}
              collapsed={collapsed}
              onClick={() => setSidebar(item.key)}
            />
          ))}
        </div>

        {collapsed ? null : (
          <>
            <div>
              <GroupLabel
                action={
                  <IconButton
                    size="sm"
                    icon={<Plus size={12} />}
                    label="新建项目"
                    onClick={() => {
                      void useApp
                        .getState()
                        .askName({ title: '新建项目', placeholder: '项目名称，例如：客户礼品' })
                        .then((name) => {
                          if (name) void useApp.getState().createProject(name)
                        })
                    }}
                  />
                }
              >
                项目
              </GroupLabel>
              <div className="space-y-0.5">
                {projects.length === 0 ? (
                  <p className="px-2 py-1 text-[11px] text-ink-500">暂无项目</p>
                ) : (
                  projects.map((p) => (
                    <NavItem
                      key={p.id}
                      icon={<FolderKanban size={14} />}
                      label={p.name}
                      active={isActive(`project:${p.id}`)}
                      onClick={() => setSidebar(`project:${p.id}`)}
                    />
                  ))
                )}
              </div>
            </div>

            <div>
              <GroupLabel>标签</GroupLabel>
              <div className="space-y-0.5">
                {tags.length === 0 ? (
                  <p className="px-2 py-1 text-[11px] text-ink-500">暂无标签</p>
                ) : (
                  tags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSidebar(`tag:${t.id}`)}
                      className={cn(
                        'no-drag group relative flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors',
                        isActive(`tag:${t.id}`)
                          ? 'bg-white/[0.06] text-ink-100'
                          : 'text-ink-300 hover:bg-white/[0.035]'
                      )}
                    >
                      {isActive(`tag:${t.id}`) ? (
                        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent" />
                      ) : null}
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="flex-1 truncate text-xs">{t.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </nav>

      <div className={cn('border-t border-white/[0.055]', collapsed ? 'px-2 py-2' : 'px-3 py-2')}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <Tooltip content="新建模型库">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('forma:new-library'))}
                className="no-drag grid h-7 w-7 place-items-center rounded-md text-ink-400 hover:bg-white/[0.06] hover:text-ink-100"
              >
                <FolderPlus size={13} />
              </button>
            </Tooltip>
            <Tooltip content="打开数据目录">
              <button
                type="button"
                onClick={() => void window.forma.revealUserData()}
                className="no-drag grid h-7 w-7 place-items-center rounded-md text-ink-400 hover:bg-white/[0.06] hover:text-ink-100"
              >
                <Settings2 size={13} />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[10.5px] text-ink-500">
            <span className="tabular truncate">
              {stats ? `${stats.count} 个模型 · ${formatSize(stats.bytes)}` : '—'}
            </span>
            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton
                size="sm"
                icon={<FolderPlus size={12} />}
                label="新建模型库"
                onClick={() => window.dispatchEvent(new CustomEvent('forma:new-library'))}
              />
              <IconButton
                size="sm"
                icon={<Settings2 size={12} />}
                label="打开数据目录"
                onClick={() => void window.forma.revealUserData()}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}
