import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import { useApp } from '@renderer/store/useApp'
import { Button, Input, Segmented } from './ui/kit'
import { Dialog, DialogContent } from './ui/overlay'
import type { LibraryMode } from '@shared/types'

/**
 * 新建模型库对话框。
 *
 * 之前这一入口用的是 window.prompt —— Electron 渲染进程并不支持
 * 同步弹窗输入，调用直接返回 null 或抛错，于是"空白安装建不了库"。
 * 这里改成应用内对话框，菜单 / 工具栏 / 侧栏 / 空状态共用同一份实现。
 */
export function NewLibraryDialog(): ReactElement | null {
  const open = useApp((s) => s.libraryDialogOpen)
  const close = useApp((s) => s.closeLibraryDialog)
  const createLibrary = useApp((s) => s.createLibrary)
  const pickFolder = useApp((s) => s.pickFolder)
  const rescan = useApp((s) => s.rescan)
  const pushToast = useApp((s) => s.pushToast)

  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [mode, setMode] = useState<LibraryMode>('reference')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setPath('')
    setMode('reference')
    setError(null)
    setBusy(false)
  }, [open])

  const chooseFolder = async (): Promise<void> => {
    const picked = await pickFolder('选择模型库文件夹')
    if (!picked) return
    setPath(picked)
    setError(null)
    // 用文件夹名做默认库名，省去用户手输
    if (!name.trim()) {
      const base = picked.split('/').filter(Boolean).pop()
      if (base) setName(base)
    }
  }

  const submit = async (): Promise<void> => {
    const clean = name.trim()
    if (!clean) {
      setError('请先填写模型库名称')
      return
    }
    if (!path) {
      setError('请先选择一个文件夹作为模型库')
      return
    }
    setBusy(true)
    setError(null)
    const lib = await createLibrary(clean, path, mode)
    setBusy(false)
    if (!lib) {
      setError('创建失败：该文件夹可能已被占用，或名称不合法')
      return
    }
    close()
    pushToast(`模型库「${lib.name}」已创建，正在扫描文件…`, 'success')
    // 立刻扫一遍，避免建完库面对一片空白
    void rescan()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : close())}>
      <DialogContent
        title="新建模型库"
        description="模型库指向一个本地文件夹。FORMA 只索引其中的 STL / OBJ / 3MF 并在本地数据库记录元数据。"
      >
        <div className="space-y-3.5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-ink-300">库名称</span>
            <Input
              autoFocus
              value={name}
              placeholder="例如：我的 3D 打印库"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
            />
          </label>

          <div>
            <span className="mb-1.5 block text-[11px] font-medium text-ink-300">文件夹</span>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-md border border-overlay/[0.08] bg-base-900 px-2.5 py-2 text-[11.5px] text-ink-300">
                {path || <span className="text-ink-500">尚未选择</span>}
              </div>
              <Button variant="ghost" onClick={() => void chooseFolder()} className="shrink-0">
                <FolderOpen size={13} /> 选择
              </Button>
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[11px] font-medium text-ink-300">导入方式</span>
            <Segmented
              value={mode}
              onChange={(v) => setMode(v)}
              options={[
                { value: 'reference', label: '引用模式', title: '不移动原始文件，只建索引' },
                { value: 'managed', label: '托管模式', title: '把文件复制进应用库目录' }
              ]}
            />
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-500">
              {mode === 'reference'
                ? '引用模式：原文件留在你的文件夹里，FORMA 只记录路径。移动或删除原文件会导致「文件丢失」。'
                : '托管模式：文件会复制到应用数据目录，源文件可以自由搬动；两种模式都不影响"从库中移除"时原文件的去留。'}
            </p>
          </div>

          {error ? (
            <p className="rounded-md border border-danger/25 bg-danger/[0.08] px-2.5 py-1.5 text-[11px] text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={close} disabled={busy}>
              取消
            </Button>
            <Button variant="accent" onClick={() => void submit()} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : null}
              创建并扫描
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
