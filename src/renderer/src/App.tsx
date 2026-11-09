import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { AssetGrid } from './components/AssetGrid'
import { Inspector } from './components/Inspector'
import { Toasts } from './components/Toasts'
import { NewLibraryDialog } from './components/NewLibraryDialog'
import { NameDialog } from './components/NameDialog'
import { useApp } from './store/useApp'
import { TooltipProvider } from './components/ui/kit'
import { enqueueThumbnails } from './viewers/ThumbnailRenderer'

const NARROW_INSPECTOR = 1120
const NARROW_NAV = 940

export default function App(): ReactElement {
  const init = useApp((s) => s.init)
  const models = useApp((s) => s.models)
  const focusId = useApp((s) => s.focusId)
  const theme = useApp((s) => s.settings.theme)

  const [compact, setCompact] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)

  useEffect(() => {
    void init()
  }, [init])

  // 真实缩略图队列：为缺少缩略图的模型离屏渲染并缓存
  useEffect(() => {
    enqueueThumbnails(models)
  }, [models])

  // 选中模型即展开检查器；窄窗口下不自动弹，避免挤压网格
  useEffect(() => {
    if (!focusId) return
    if (window.innerWidth >= NARROW_INSPECTOR) setInspectorOpen(true)
  }, [focusId])

  // 响应式：跨阈值时自动收/展，但不持续覆盖用户的手动开关
  useEffect(() => {
    let navAuto = window.innerWidth < NARROW_NAV
    let inspAuto = window.innerWidth < NARROW_INSPECTOR
    setNavCollapsed(navAuto)
    if (inspAuto) setInspectorOpen(false)

    const onResize = (): void => {
      const narrowNav = window.innerWidth < NARROW_NAV
      if (narrowNav !== navAuto) {
        navAuto = narrowNav
        setNavCollapsed(narrowNav)
      }
      const narrowInsp = window.innerWidth < NARROW_INSPECTOR
      if (narrowInsp !== inspAuto) {
        inspAuto = narrowInsp
        setInspectorOpen(!narrowInsp)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 主题：写成 <html data-theme>，颜色令牌由 index.css 的两组变量提供。
  // 「跟随系统」时订阅 prefers-color-scheme 变化，不用重启。
  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const apply = (): void => {
      const light = theme === 'light' || (theme === 'system' && mq.matches)
      root.dataset.theme = light ? 'light' : 'dark'
      root.style.colorScheme = light ? 'light' : 'dark'
    }
    apply()
    if (theme !== 'system') return
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  // 全局快捷键：⌘B 导航栏、⌘I 检查器、⌘A 全选、⌘⌫ 从库移除、Esc 取消选择
  // （⌘F 聚焦搜索在 Toolbar 内处理，因为它持有输入框 ref）
  useEffect(() => {
    const isTyping = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (document.querySelector('[role="dialog"]')) return
        if (isTyping(e.target)) return
        if (useApp.getState().selected.size === 0) return
        e.preventDefault()
        useApp.getState().clearSelection()
        return
      }

      if (!(e.metaKey || e.ctrlKey) || isTyping(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'b') {
        e.preventDefault()
        setNavCollapsed((v) => !v)
        return
      }
      if (key === 'i') {
        e.preventDefault()
        setInspectorOpen((v) => !v)
        return
      }
      if (key === 'a') {
        e.preventDefault()
        useApp.getState().selectAllVisible()
        return
      }
      // ⌘⇧L 外观切换：深色 → 浅色 → 跟随系统
      if (key === 'l' && e.shiftKey) {
        e.preventDefault()
        const cur = useApp.getState().settings.theme
        const next = cur === 'dark' ? 'light' : cur === 'light' ? 'system' : 'dark'
        void useApp.getState().setTheme(next)
        return
      }
      // Finder 惯例：⌘⌫ 移出库（不删除原始文件）
      if (e.key === 'Backspace') {
        e.preventDefault()
        void useApp.getState().deleteSelection(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const unsubs = [
      window.forma.onMenu('import', () => {
        void useApp.getState().importViaDialog()
      }),
      window.forma.onMenu('rescan', () => {
        void useApp.getState().rescan()
      }),
      window.forma.onMenu('new-library', () => {
        useApp.getState().openLibraryDialog()
      })
    ]

    // 菜单和界面上所有"新建库"入口都收敛到同一个对话框，
    // 不再依赖渲染进程里不可用的 window.prompt。
    const onNewLibrary = (): void => {
      useApp.getState().openLibraryDialog()
    }
    window.addEventListener('forma:new-library', onNewLibrary)

    return () => {
      unsubs.forEach((fn) => fn())
      window.removeEventListener('forma:new-library', onNewLibrary)
    }
  }, [])

  return (
    <TooltipProvider>
      <div className="flex h-full w-full overflow-hidden bg-base-950">
        <Sidebar collapsed={navCollapsed} onToggleCollapse={() => setNavCollapsed((v) => !v)} />
        <main className="flex min-w-0 flex-1 flex-col bg-base-900">
          <Toolbar
            compact={compact}
            onToggleDensity={() => setCompact((v) => !v)}
            sidebarCollapsed={navCollapsed}
            onToggleSidebar={() => setNavCollapsed((v) => !v)}
            inspectorOpen={inspectorOpen}
            onToggleInspector={() => setInspectorOpen((v) => !v)}
          />
          <AssetGrid compact={compact} />
        </main>
        {inspectorOpen ? <Inspector onClose={() => setInspectorOpen(false)} /> : null}
      </div>
      <Toasts />
      <NewLibraryDialog />
      <NameDialog />
    </TooltipProvider>
  )
}
