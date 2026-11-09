import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, FolderOpen, FolderPlus, Loader2, SearchX, Star, Trash2, Upload } from 'lucide-react'
import { useApp } from '@renderer/store/useApp'
import { AssetCard } from './AssetCard'
import { VirtualGrid } from './VirtualGrid'
import { Button } from './ui/kit'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from './ui/overlay'
import type { ModelAsset } from '@shared/types'

export function AssetGrid({ compact }: { compact: boolean }): ReactElement {
  const models = useApp((s) => s.models)
  const total = useApp((s) => s.total)
  const loading = useApp((s) => s.loading)
  const selected = useApp((s) => s.selected)
  const focusId = useApp((s) => s.focusId)
  const sidebar = useApp((s) => s.sidebar)
  const search = useApp((s) => s.search)
  const exts = useApp((s) => s.exts)
  const libraries = useApp((s) => s.libraries)
  const tags = useApp((s) => s.tags)
  const scan = useApp((s) => s.scan)
  const duplicates = useApp((s) => s.duplicates)
  const toggleSelect = useApp((s) => s.toggleSelect)
  const selectMany = useApp((s) => s.selectMany)
  const setFocus = useApp((s) => s.setFocus)
  const toggleFavorite = useApp((s) => s.toggleFavorite)
  const importPaths = useApp((s) => s.importPaths)
  const importViaDialog = useApp((s) => s.importViaDialog)
  const revealModel = useApp((s) => s.revealModel)
  const openModel = useApp((s) => s.openModel)
  const deleteSelection = useApp((s) => s.deleteSelection)
  const deleteModels = useApp((s) => s.deleteModels)
  const loadMore = useApp((s) => s.loadMore)
  const openLibraryDialog = useApp((s) => s.openLibraryDialog)
  const attachTag = useApp((s) => s.attachTag)
  const detachTag = useApp((s) => s.detachTag)
  const clearSelection = useApp((s) => s.clearSelection)
  const selectAllVisible = useApp((s) => s.selectAllVisible)

  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const visibleSelected = useMemo(() => models.filter((m) => selected.has(m.id)), [models, selected])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectAllVisible()
      }
      if (e.key === 'Escape') clearSelection()
      if ((e.key === 'Backspace' || e.key === 'Delete') && selected.size > 0) {
        e.preventDefault()
        void deleteSelection(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectAllVisible, clearSelection, deleteSelection, selected.size])

  const onDrop = useCallback(
    async (e: React.DragEvent): Promise<void> => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const files = Array.from(e.dataTransfer.files)
      const paths = files.map((f) => window.forma.getPathForFile(f)).filter((p) => Boolean(p))
      if (paths.length > 0) {
        await importPaths(paths)
        return
      }
      const text = e.dataTransfer.getData('text/uri-list')
      if (text) {
        const urls = text
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
        if (urls.length > 0) await importPaths(urls)
      }
    },
    [importPaths]
  )

  const emptyState = ((): ReactElement | null => {
    if (loading && models.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-500">
          <Loader2 size={20} className="animate-spin" />
          <p className="text-[12px]">正在读取模型库…</p>
        </div>
      )
    }
    if (libraries.length === 0) {
      return (
        <EmptyBlock
          icon={<FolderPlus size={26} />}
          title="还没有模型库"
          desc="选择一个本地文件夹作为模型库，FORMA 会为其中的 STL / OBJ / 3MF 建立索引，并渲染真实缩略图。"
          action={
            <Button variant="accent" onClick={openLibraryDialog}>
              <FolderPlus size={13} /> 创建模型库
            </Button>
          }
        />
      )
    }
    if (sidebar === 'duplicates' && duplicates.length === 0) {
      return (
        <EmptyBlock icon={<Box size={26} />} title="没有重复文件" desc="同一模型库内 SHA-256 完全一致的模型会出现在这里。" />
      )
    }
    if (search || exts.length > 0) {
      return (
        <EmptyBlock
          icon={<SearchX size={26} />}
          title="没有匹配的结果"
          desc={search ? `没有找到与“${search}”相关的模型。` : '当前筛选条件下没有模型。'}
        />
      )
    }
    if (models.length === 0) {
      return (
        <EmptyBlock
          icon={<Upload size={26} />}
          title="这个库还是空的"
          desc="把模型文件夹拖到这里，或点击导入，FORMA 会真实解析几何并生成缩略图。"
          action={
            <Button variant="accent" onClick={() => void importViaDialog()}>
              <Upload size={13} /> 导入文件夹
            </Button>
          }
        />
      )
    }
    return null
  })()

  const card = (m: ModelAsset, index: number): ReactElement => {
    const contextModel = visibleSelected.length > 1 && selected.has(m.id) ? visibleSelected : [m]
    const anyFavorite = contextModel.every((x) => x.favorite)
    return (
      <ContextMenu key={m.id}>
        <ContextMenuTrigger asChild>
          <div className="h-full w-full">
            <AssetCard
              model={m}
              compact={compact}
              selected={selected.has(m.id)}
              focused={focusId === m.id}
              onClick={(e) => {
                // 桌面资产管理器的惯例：单击 = 选中并聚焦详情；
                // 只有按住 ⌘/Ctrl/Shift 才是多选累加。
                if (e.metaKey || e.ctrlKey || e.shiftKey) {
                  toggleSelect(m.id, true)
                  return
                }
                selectMany([m.id])
                setFocus(m.id)
              }}
              onDoubleClick={() => setFocus(m.id)}
              onToggleFavorite={() => void toggleFavorite(m.id)}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setFocus(m.id)}>在检查器中打开</ContextMenuItem>
          <ContextMenuItem onSelect={() => void revealModel(m.id)}>
            <FolderOpen size={13} /> 在访达中显示
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void openModel(m.id)}>用默认程序打开</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void Promise.all(contextModel.map((x) => toggleFavorite(x.id)))}>
            <Star size={13} /> {anyFavorite ? '取消收藏' : '加入收藏'}
          </ContextMenuItem>
          {tags.length > 0 ? (
            <>
              <ContextMenuSeparator />
              {tags.slice(0, 6).map((tag) => {
                const allHave = contextModel.every((x) => x.tags.some((t) => t.id === tag.id))
                return (
                  <ContextMenuItem
                    key={tag.id}
                    onSelect={() =>
                      void (allHave
                        ? detachTag(tag.id, contextModel.map((x) => x.id))
                        : attachTag(tag.id, contextModel.map((x) => x.id)))
                    }
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    {allHave ? `移除标签「${tag.name}」` : `添加标签「${tag.name}」`}
                  </ContextMenuItem>
                )
              })}
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            danger
            onSelect={() => void deleteModels(contextModel.map((x) => x.id), false)}
          >
            <Trash2 size={13} />
            {contextModel.length > 1
              ? `从库中移除这 ${contextModel.length} 项（保留文件）`
              : '从库中移除（保留文件）'}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return (
    <div
      className="relative min-h-0 flex-1"
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        dragDepth.current -= 1
        if (dragDepth.current <= 0) setDragging(false)
      }}
      onDrop={onDrop}
    >
      {emptyState ? (
        <div className="h-full">{emptyState}</div>
      ) : compact ? (
        <VirtualGrid
          items={models}
          minWidth={360}
          gap={4}
          heightRatio={60 / 360}
          renderItem={card}
          onEndReached={() => void loadMore()}
          className="h-full"
        />
      ) : (
        <VirtualGrid
          items={models}
          minWidth={200}
          gap={12}
          heightRatio={1.32}
          renderItem={card}
          onEndReached={() => void loadMore()}
          className="h-full"
        />
      )}

      {scan?.active ? (
        <div className="absolute bottom-3 left-1/2 z-20 w-[380px] -translate-x-1/2 rounded-lg border border-white/10 bg-base-800/95 px-3 py-2 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2 text-[11px] text-ink-300">
            <Loader2 size={12} className="animate-spin text-accent" />
            <span className="flex-1 truncate">
              正在扫描 · {scan.currentFile ?? '发现文件…'}
            </span>
            <span className="tabular-nums text-ink-500">
              {scan.done}/{scan.total || '?'}
            </span>
          </div>
          <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent/80 transition-all"
              style={{ width: scan.total ? `${Math.min(100, (scan.done / scan.total) * 100)}%` : '30%' }}
            />
          </div>
        </div>
      ) : null}

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-accent/50 bg-base-950/80">
          <Upload size={24} className="text-accent" />
          <p className="text-[12px] text-ink-200">松开即可导入到当前模型库</p>
        </div>
      ) : null}

      {visibleSelected.length > 0 ? (
        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-lg border border-white/10 bg-base-800/95 px-3 py-1.5 text-[11px] text-ink-300 shadow-xl backdrop-blur">
          <span className="tabular-nums">已选 {visibleSelected.length} 项</span>
          <span className="h-3 w-px bg-white/10" />
          <button
            type="button"
            className="hover:text-danger"
            onClick={() => void deleteModels(visibleSelected.map((m) => m.id), false)}
          >
            移出模型库
          </button>
          <button type="button" className="hover:text-ink-100" onClick={clearSelection}>
            取消
          </button>
        </div>
      ) : null}

      {total > models.length && models.length > 0 ? (
        <div className="absolute bottom-3 right-3 z-20 rounded-md bg-base-800/90 px-2 py-1 text-[10px] text-ink-500">
          已加载 {models.length} / {total}
        </div>
      ) : null}
    </div>
  )
}

function EmptyBlock({
  icon,
  title,
  desc,
  action
}: {
  icon: ReactElement
  title: string
  desc: string
  action?: ReactElement
}): ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-xl border border-overlay/[0.06] bg-overlay/[0.02] text-ink-600">
        {icon}
      </div>
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink-100">{title}</h2>
      <p className="max-w-[400px] text-xs leading-relaxed text-ink-400">{desc}</p>
      {action ? <div className="mt-1.5">{action}</div> : null}
    </div>
  )
}
