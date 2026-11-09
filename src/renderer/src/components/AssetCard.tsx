import type { ReactElement, MouseEvent } from 'react'
import { AlertTriangle, Check, Star } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import type { ModelAsset } from '@shared/types'
import { formatBytes, formatDimsCompact } from '@renderer/lib/format'

const EXT_TONE: Record<string, string> = {
  stl: 'text-[#93B8F0]',
  obj: 'text-[#B4A5E8]',
  '3mf': 'text-[#B8C6FF]'
}

function Thumb({ model, compact }: { model: ModelAsset; compact?: boolean }): ReactElement {
  if (model.thumbnail) {
    return (
      <img
        src={`forma-thumb://local/${model.id}`}
        alt={model.filename}
        className={cn(
          'h-full w-full object-contain transition-transform duration-300 studio-ease',
          !compact && 'group-hover:scale-[1.035]'
        )}
        draggable={false}
      />
    )
  }
  if (model.parseError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-base-800">
        <AlertTriangle size={compact ? 12 : 15} className="text-warn/70" />
        {compact ? null : <span className="text-[10px] text-ink-500">解析失败</span>}
      </div>
    )
  }
  // 统一几何占位：没有缩略图时给一个克制的线框立方体，而不是纯色块
  return (
    <div className="thumb-stage relative flex h-full w-full items-center justify-center overflow-hidden bg-base-800">
      <svg
        viewBox="0 0 48 48"
        className={cn('relative text-ink-600', compact ? 'h-5 w-5' : 'h-9 w-9')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      >
        <path d="M24 7 L39 15.5 V32.5 L24 41 L9 32.5 V15.5 Z" />
        <path d="M9 15.5 L24 24 L39 15.5" />
        <path d="M24 24 V41" />
      </svg>
    </div>
  )
}

interface AssetCardProps {
  model: ModelAsset
  selected: boolean
  focused: boolean
  compact: boolean
  onClick: (e: MouseEvent) => void
  onDoubleClick: () => void
  onToggleFavorite: () => void
}

export function AssetCard({
  model,
  selected,
  focused,
  compact,
  onClick,
  onDoubleClick,
  onToggleFavorite
}: AssetCardProps): ReactElement {
  if (compact) {
    return (
      <div
        data-asset-card={model.id}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={cn(
          'no-drag group relative flex h-full cursor-default items-center gap-2.5 overflow-hidden rounded-md border pl-2 pr-2.5',
          'transition-colors duration-150',
          selected
            ? 'border-accent/40 bg-accent/[0.055]'
            : 'border-transparent hover:border-white/[0.1] hover:bg-white/[0.025]'
        )}
      >
        {selected ? <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r bg-accent" /> : null}
        <div className="relative h-[42px] w-[52px] shrink-0 overflow-hidden rounded-[5px] border border-white/[0.04] bg-base-800">
          <Thumb model={model} compact />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-ink-100">{model.filename}</p>
          <p className="mt-[2px] flex items-center gap-1.5 truncate tabular text-[10.5px] text-ink-500">
            <span className={cn('font-medium uppercase tracking-wide', EXT_TONE[model.ext] ?? 'text-ink-500')}>
              {model.ext}
            </span>
            <span className="h-[2px] w-[2px] rounded-full bg-white/20" />
            <span>{formatBytes(model.size)}</span>
            <span className="h-[2px] w-[2px] rounded-full bg-white/20" />
            <span className="truncate">
              {model.bbox ? `${formatDimsCompact(model.bbox)} ${model.unit === 'inch' ? 'in' : model.unit}` : '尺寸未知'}
            </span>
          </p>
        </div>
        {model.missing ? <span className="shrink-0 text-[10px] text-danger">丢失</span> : null}
        {model.favorite ? <Star size={11} className="shrink-0 fill-accent/80 text-accent/80" /> : null}
      </div>
    )
  }

  const dims = model.bbox ? `${formatDimsCompact(model.bbox)} ${model.unit === 'inch' ? 'in' : model.unit}` : null

  return (
    <div
      data-asset-card={model.id}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        'no-drag group relative flex h-full w-full cursor-default flex-col overflow-hidden rounded-card',
        'border bg-base-750 transition-[border-color,background-color,box-shadow] duration-200 studio-ease',
        selected
          ? 'border-accent/55 bg-accent/[0.05] shadow-focus'
          : focused
            ? 'border-white/[0.16] bg-base-700'
            : 'border-white/[0.055] hover:border-white/[0.14] hover:bg-base-700',
        'card-shadow'
      )}
    >
      {/* 缩略图：方形舞台，模型居中不裁切 */}
      <div className="thumb-stage relative min-h-0 flex-1 overflow-hidden bg-base-800">
        <Thumb model={model} />

        {/* 左上：状态胶囊 */}
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
          {model.missing ? (
            <span className="rounded-[4px] bg-danger/85 px-1.5 py-[1px] text-[9.5px] font-medium text-base-950">
              文件丢失
            </span>
          ) : null}
          {model.printStatus === 'printed' ? (
            <span className="rounded-[4px] bg-ok/80 px-1.5 py-[1px] text-[9.5px] font-medium text-base-950">已打印</span>
          ) : model.printStatus === 'queued' ? (
            <span className="rounded-[4px] bg-warn/80 px-1.5 py-[1px] text-[9.5px] font-medium text-base-950">待打印</span>
          ) : null}
          {model.warnings ? (
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full bg-base-950/50"
              title={`解析提示：${model.warnings}`}
            >
              <AlertTriangle size={10} className="text-warn" />
            </span>
          ) : null}
        </div>

        {/* 右上：收藏（悬停浮现 / 已收藏常显） */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite()
          }}
          className={cn(
            'absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md transition-all duration-150',
            model.favorite
              ? 'bg-base-950/45 text-accent opacity-100'
              : 'text-white/70 opacity-0 hover:bg-base-950/50 group-hover:opacity-100'
          )}
          title={model.favorite ? '取消收藏' : '收藏'}
        >
          <Star size={12} className={model.favorite ? 'fill-accent text-accent' : ''} />
        </button>

        {/* 选中角标：明确的勾选，而不是只靠描边 */}
        {selected ? (
          <span className="pointer-events-none absolute left-2 top-2 z-10 grid h-4 w-4 place-items-center rounded-full bg-accent shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
            <Check size={10} className="text-base-950" strokeWidth={2.4} />
          </span>
        ) : null}
      </div>

      {/* 信息条：名称优先，元数据降级为一行等宽数字 */}
      <div className="flex shrink-0 flex-col justify-center gap-[3px] border-t border-white/[0.05] px-2.5 py-2">
        <p className="truncate text-xs font-medium leading-[16px] tracking-[-0.005em] text-ink-100" title={model.filename}>
          {model.filename}
        </p>
        <div className="flex items-center gap-1.5 truncate tabular text-[10.5px] text-ink-500">
          <span className={cn('font-semibold uppercase tracking-[0.08em]', EXT_TONE[model.ext] ?? 'text-ink-500')}>
            {model.ext}
          </span>
          <span className="h-[2px] w-[2px] shrink-0 rounded-full bg-white/20" />
          <span className="shrink-0">{formatBytes(model.size)}</span>
          {dims ? (
            <>
              <span className="h-[2px] w-[2px] shrink-0 rounded-full bg-white/20" />
              <span className="truncate">{dims}</span>
            </>
          ) : null}
        </div>
        {model.tags.length > 0 ? (
          <div className="mt-[1px] flex items-center gap-1 overflow-hidden">
            {model.tags.slice(0, 2).map((t) => (
              <span
                key={t.id}
                className="truncate rounded-[3px] px-1 py-[1px] text-[9.5px]"
                style={{ backgroundColor: `${t.color}1F`, color: t.color }}
              >
                {t.name}
              </span>
            ))}
            {model.tags.length > 2 ? (
              <span className="text-[9.5px] text-ink-500">+{model.tags.length - 2}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      {selected ? <div className="pointer-events-none absolute inset-0 rounded-card ring-1 ring-inset ring-accent/15" /> : null}
    </div>
  )
}
