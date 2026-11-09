import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Box, ExternalLink, FolderOpen, Plus, Star, Trash2, X } from 'lucide-react'
import type { GeometryPayload, PrintRecord, Unit } from '@shared/types'
import { forma } from '@renderer/lib/api'
import { useApp } from '@renderer/store/useApp'
import { ModelViewer } from '@renderer/viewers/ModelViewer'
import { Badge, IconButton, Input, Textarea } from './ui/kit'
import { cn } from '@renderer/lib/cn'
import { formatBytes, formatCount, formatDate, formatDims, formatDuration } from '@renderer/lib/format'

const geoCache = new Map<string, { payload: GeometryPayload | null; error: string | null }>()

function useGeometry(id: string | null): { loading: boolean; payload: GeometryPayload | null; error: string | null } {
  const [state, setState] = useState<{ loading: boolean; payload: GeometryPayload | null; error: string | null }>({
    loading: false,
    payload: null,
    error: null
  })

  useEffect(() => {
    if (!id) {
      setState({ loading: false, payload: null, error: null })
      return
    }
    const cached = geoCache.get(id)
    if (cached) {
      setState({ loading: false, ...cached })
      return
    }
    let cancelled = false
    setState({ loading: true, payload: null, error: null })
    void forma.geometry
      .load({ id, maxTriangles: 900_000 })
      .then((res) => {
        if (cancelled) return
        const entry =
          res.ok && res.geometry
            ? { payload: res.geometry, error: null }
            : { payload: null, error: res.error ?? '解析失败' }
        geoCache.set(id, entry)
        if (geoCache.size > 6) {
          const first = geoCache.keys().next().value
          if (first) geoCache.delete(first)
        }
        setState({ loading: false, ...entry })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          loading: false,
          payload: null,
          error: error instanceof Error ? error.message : '解析失败'
        })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return state
}

function Row({
  label,
  value,
  mono
}: {
  label: string
  value: ReactElement | string
  mono?: boolean
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[3.5px]">
      <span className="shrink-0 text-[10.5px] text-ink-500">{label}</span>
      <span className={cn('min-w-0 truncate text-right text-[11.5px] text-ink-300', mono && 'tabular')}>
        {value}
      </span>
    </div>
  )
}

function Section({
  title,
  action,
  children
}: {
  title: string
  action?: ReactElement
  children: ReactElement | ReactElement[]
}): ReactElement {
  return (
    <div className="border-t border-overlay/[0.055] px-3.5 py-3">
      <div className="mb-2 flex h-5 items-center justify-between">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-500">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function printLabel(status: PrintRecord['status']): string {
  return { none: '未打印', queued: '待打印', printed: '已打印', failed: '失败' }[status]
}

function printTone(status: PrintRecord['status']): 'neutral' | 'warn' | 'ok' | 'danger' {
  return { none: 'neutral', queued: 'warn', printed: 'ok', failed: 'danger' }[status] as
    | 'neutral'
    | 'warn'
    | 'ok'
    | 'danger'
}

export function Inspector({ onClose }: { onClose: () => void }): ReactElement {
  const focusId = useApp((s) => s.focusId)
  const models = useApp((s) => s.models)
  const selected = useApp((s) => s.selected)
  const tags = useApp((s) => s.tags)
  const projects = useApp((s) => s.projects)
  const toggleFavorite = useApp((s) => s.toggleFavorite)
  const updateModel = useApp((s) => s.updateModel)
  const revealModel = useApp((s) => s.revealModel)
  const openModel = useApp((s) => s.openModel)
  const deleteSelection = useApp((s) => s.deleteSelection)
  const addTag = useApp((s) => s.addTag)
  const attachTag = useApp((s) => s.attachTag)
  const detachTag = useApp((s) => s.detachTag)
  const attachProject = useApp((s) => s.attachProject)
  const addPrintRecord = useApp((s) => s.addPrintRecord)

  const model = useMemo(() => models.find((m) => m.id === focusId) ?? null, [models, focusId])
  const geo = useGeometry(model?.id ?? null)

  const [tagDraft, setTagDraft] = useState('')
  const [notes, setNotes] = useState('')
  const [records, setRecords] = useState<PrintRecord[]>([])

  useEffect(() => {
    setNotes(model?.notes ?? '')
    setTagDraft('')
    if (!model) {
      setRecords([])
      return
    }
    let cancelled = false
    void forma.print.list({ modelId: model.id }).then((rows) => {
      if (!cancelled) setRecords(rows)
    })
    return () => {
      cancelled = true
    }
  }, [model?.id])

  if (!model) {
    const count = selected.size
    return (
      <aside className="flex w-[320px] shrink-0 flex-col border-l border-overlay/[0.055] bg-base-850">
        <div className="drag-region flex h-14 shrink-0 items-center justify-end px-3">
          <IconButton icon={<X size={13} />} label="收起检查器 (⌘I)" onClick={onClose} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-8 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full border border-overlay/[0.06] text-ink-600">
            <Box size={18} />
          </div>
          <p className="text-xs text-ink-300">{count > 0 ? `已选择 ${count} 个模型` : '未选择模型'}</p>
          <p className="text-[10.5px] leading-relaxed text-ink-500">
            {count > 0
              ? '在网格上使用批量操作，或点击单个模型查看几何与打印信息。'
              : '点击任意模型，这里会显示 3D 预览、几何信息、标签与打印记录。'}
          </p>
        </div>
      </aside>
    )
  }

  const unitLabel = model.unit === 'inch' ? 'in' : model.unit

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-overlay/[0.055] bg-base-850">
      <div className="drag-region flex h-14 shrink-0 items-center gap-2 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-xs font-medium text-ink-100" title={model.filename}>
            {model.filename.replace(/\.[^.]+$/, '')}
          </span>
          <span className="shrink-0 rounded-[3px] bg-overlay/[0.05] px-1 py-[1px] text-[9.5px] font-semibold uppercase tracking-wide text-ink-400">
            {model.ext}
          </span>
        </div>
        <div className="no-drag flex shrink-0 items-center gap-0.5">
          <IconButton
            icon={<Star size={13} className={model.favorite ? 'fill-accent text-accent' : ''} />}
            label={model.favorite ? '取消收藏' : '收藏'}
            active={model.favorite}
            onClick={() => void toggleFavorite(model.id)}
          />
          <IconButton icon={<X size={13} />} label="收起检查器 (⌘I)" onClick={onClose} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 3D 预览：大尺寸优先，模型本身是主角 */}
        <div className="px-3 pb-2.5">
          <div className="overflow-hidden rounded-panel border border-overlay/[0.06]">
            <ModelViewer
              model={model}
              payload={geo.payload}
              loading={geo.loading}
              error={geo.error}
              className="h-[300px] w-full"
            />
          </div>

          {geo.payload && geo.payload.warnings.length > 0 ? (
            <div className="mt-2 flex gap-1.5 rounded-md border border-warn/20 bg-warn/[0.06] px-2 py-1.5">
              <AlertTriangle size={12} className="mt-[1px] shrink-0 text-warn/80" />
              <p className="text-[10px] leading-relaxed text-warn/80">{geo.payload.warnings.join('；')}</p>
            </div>
          ) : null}

          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => void openModel(model.id)}
              className="no-drag inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md bg-overlay/[0.045] text-[11px] text-ink-300 transition-colors hover:bg-overlay/[0.08] hover:text-ink-100"
            >
              <ExternalLink size={12} /> 外部打开
            </button>
            <button
              type="button"
              onClick={() => void revealModel(model.id)}
              className="no-drag inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md bg-overlay/[0.045] text-[11px] text-ink-300 transition-colors hover:bg-overlay/[0.08] hover:text-ink-100"
            >
              <FolderOpen size={12} /> 访达
            </button>
            <button
              type="button"
              title="从库中移除（保留原始文件）"
              onClick={() => void deleteSelection(false)}
              className="no-drag grid h-7 w-7 shrink-0 place-items-center rounded-md text-danger/70 transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        <Section
          title="几何信息"
          action={
            <select
              value={model.unit}
              onChange={(e) => void updateModel(model.id, { unit: e.target.value as Unit })}
              className="no-drag h-[20px] rounded border border-overlay/[0.08] bg-base-800 px-1 text-[10px] text-ink-300 outline-none"
              title="模型单位（STL 没有可靠单位信息，可手动指定）"
            >
              <option value="mm">毫米</option>
              <option value="cm">厘米</option>
              <option value="inch">英寸</option>
            </select>
          }
        >
          <>
            <Row label="尺寸" value={model.bbox ? formatDims(model.bbox, model.unit) : '—'} mono />
            <Row label="三角面" value={model.triangles !== null ? formatCount(model.triangles) : '—'} mono />
            <Row label="顶点" value={model.vertices !== null ? formatCount(model.vertices) : '—'} mono />
            <Row
              label="独立网格"
              value={model.meshCount === null ? '—' : model.meshCount > 1 ? `${model.meshCount} 个` : '单网格'}
            />
            <Row
              label="体积"
              value={model.volumeMm3 ? `${(model.volumeMm3 / 1000).toFixed(1)} cm³` : '未计算'}
              mono
            />
            <Row label="封闭性" value={model.closed === null ? '未检测' : model.closed ? '封闭' : '非封闭'} />
            {!model.unitDeclared ? (
              <p className="mt-2 rounded bg-overlay/[0.03] px-2 py-1.5 text-[9.5px] leading-relaxed text-ink-500">
                {model.ext === 'stl' || model.ext === 'obj'
                  ? `${model.ext.toUpperCase()} 不携带单位信息，当前按 ${unitLabel} 显示。可在右上角切换。`
                  : '该文件未声明单位，已按毫米估算。'}
              </p>
            ) : null}
          </>
        </Section>

        <Section title="文件">
          <>
            <Row label="大小" value={formatBytes(model.size)} mono />
            <Row label="修改时间" value={formatDate(model.mtime)} mono />
            <Row label="导入时间" value={formatDate(model.importedAt)} mono />
            <Row label="存储模式" value={model.mode === 'managed' ? '托管（库内副本）' : '引用（原始位置）'} />
            <Row label="SHA-256" value={model.sha256 ? `${model.sha256.slice(0, 10)}…` : '—'} mono />
            <div className="mt-2 rounded bg-overlay/[0.03] px-2 py-1.5">
              <p className="selectable break-all text-[9.5px] leading-relaxed text-ink-500">{model.path}</p>
            </div>
          </>
        </Section>

        <Section title="标签" action={<Plus size={11} className="text-ink-500" />}>
          <>
            <div className="flex flex-wrap gap-1">
              {model.tags.length === 0 ? (
                <span className="text-[10.5px] text-ink-500">暂无标签</span>
              ) : (
                model.tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void detachTag(t.id, [model.id])}
                    className="no-drag group inline-flex items-center gap-1 rounded-[4px] px-1.5 py-[2px] text-[10px]"
                    style={{ backgroundColor: `${t.color}22`, color: t.color }}
                  >
                    {t.name}
                    <X size={9} className="opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))
              )}
            </div>
            <div className="mt-2">
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagDraft.trim()) {
                    const existing = tags.find((t) => t.name.toLowerCase() === tagDraft.trim().toLowerCase())
                    if (existing) void attachTag(existing.id, [model.id])
                    else void addTag(tagDraft.trim(), [model.id])
                    setTagDraft('')
                  }
                }}
                placeholder="输入标签后回车"
                className="h-6 text-[11px]"
              />
            </div>
            {tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {tags
                  .filter((t) => !model.tags.some((x) => x.id === t.id))
                  .slice(0, 8)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => void attachTag(t.id, [model.id])}
                      className="no-drag rounded px-1.5 py-[2px] text-[10px] text-ink-400 transition-colors hover:bg-overlay/[0.06] hover:text-ink-200"
                    >
                      + {t.name}
                    </button>
                  ))}
              </div>
            ) : null}
          </>
        </Section>

        {projects.length > 0 ? (
          <Section title="项目">
            <div className="flex flex-wrap gap-1">
              {projects.map((p) => {
                const active = model.projectIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void attachProject(p.id, [model.id])}
                    disabled={active}
                    className={cn(
                      'no-drag rounded-[4px] px-1.5 py-[2px] text-[10px] transition-colors',
                      active
                        ? 'bg-accent/12 text-accent'
                        : 'text-ink-400 hover:bg-overlay/[0.06] hover:text-ink-200'
                    )}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          </Section>
        ) : null}

        <Section
          title="打印"
          action={<Badge tone={printTone(model.printStatus)}>{printLabel(model.printStatus)}</Badge>}
        >
          <>
            <div className="grid grid-cols-4 gap-1">
              {(['queued', 'printed', 'failed', 'none'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => void addPrintRecord(model.id, st)}
                  className={cn(
                    'no-drag rounded border px-1 py-[3px] text-[10px] transition-colors',
                    model.printStatus === st
                      ? 'border-accent/40 bg-accent/10 text-accent'
                      : 'border-overlay/[0.07] text-ink-400 hover:border-overlay/[0.16] hover:text-ink-200'
                  )}
                >
                  {printLabel(st)}
                </button>
              ))}
            </div>
            {records.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {records.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-center gap-1.5 text-[10px] text-ink-500">
                    <span className="h-1 w-1 rounded-full bg-white/20" />
                    <span className="text-ink-300">{printLabel(r.status)}</span>
                    <span className="tabular">{formatDate(r.printedAt)}</span>
                    {r.material ? <span className="truncate">{r.material}</span> : null}
                    {r.durationSeconds ? <span className="tabular">{formatDuration(r.durationSeconds)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[10px] leading-relaxed text-ink-500">
                暂无打印记录。点击上方状态即可记录一次打印。
              </p>
            )}
          </>
        </Section>

        <Section title="备注">
          <>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (model.notes ?? '')) void updateModel(model.id, { notes })
              }}
              placeholder="记录这个模型的用途、修改思路…"
              rows={3}
              className="text-[11px]"
            />
            <div className="mt-2">
              <Input
                defaultValue={model.sourceUrl ?? ''}
                placeholder="来源 URL"
                className="h-6 text-[11px]"
                onBlur={(e) => {
                  const value = e.target.value.trim()
                  if (value !== (model.sourceUrl ?? '')) void updateModel(model.id, { sourceUrl: value || null })
                }}
              />
            </div>
          </>
        </Section>
      </div>
    </aside>
  )
}
