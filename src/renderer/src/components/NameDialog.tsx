import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useApp } from '@renderer/store/useApp'
import { Button, Input } from './ui/kit'
import { Dialog, DialogContent } from './ui/overlay'

/**
 * 通用名称输入框：新建项目、重命名等需要单行文本的场合。
 * 用来替代 window.prompt —— Electron 渲染进程里它拿不到返回值。
 */
export function NameDialog(): ReactElement | null {
  const dialog = useApp((s) => s.nameDialog)
  const submit = useApp((s) => s.submitNameDialog)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (dialog) setValue(dialog.initial)
  }, [dialog])

  const confirm = (): void => {
    const clean = value.trim()
    submit(clean.length > 0 ? clean : null)
  }

  return (
    <Dialog open={dialog !== null} onOpenChange={(v) => (v ? null : submit(null))}>
      <DialogContent title={dialog?.title ?? ''} className="w-[360px]">
        <div className="space-y-3">
          <Input
            autoFocus
            value={value}
            placeholder={dialog?.placeholder ?? ''}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirm()
            }}
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => submit(null)}>
              取消
            </Button>
            <Button variant="accent" onClick={confirm}>
              确定
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
