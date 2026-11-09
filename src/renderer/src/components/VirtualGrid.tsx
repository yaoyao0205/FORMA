import type { ReactElement, ReactNode } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface VirtualGridProps<T> {
  items: T[]
  minWidth: number
  gap: number
  /** 单元高度 = 单元宽度 * heightRatio */
  heightRatio: number
  renderItem: (item: T, index: number) => ReactNode
  overscan?: number
  className?: string
  /** 滚动到接近底部时触发，用于分页加载后续结果 */
  onEndReached?: () => void
}

interface Metrics {
  width: number
  height: number
  scrollTop: number
}

/**
 * 轻量虚拟网格：只渲染视口内的行，支撑 10k 级资产列表。
 */
export function VirtualGrid<T>({
  items,
  minWidth,
  gap,
  heightRatio,
  renderItem,
  overscan = 2,
  className,
  onEndReached
}: VirtualGridProps<T>): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  const endedRef = useRef(false)
  const [metrics, setMetrics] = useState<Metrics>({ width: 0, height: 0, scrollTop: 0 })

  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setMetrics({ width: el.clientWidth, height: el.clientHeight, scrollTop: el.scrollTop })
  }, [])

  useLayoutEffect(() => {
    measure()
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  useEffect(() => {
    measure()
  }, [items.length, minWidth, measure])

  // 追加数据后重新解锁「到底」触发位：否则用户停在底部时只会加载一页，
  // 必须先把滚动条拖离底部再拖回来才能继续翻页（一万条规模下体验很差）。
  useEffect(() => {
    endedRef.current = false
  }, [items.length])

  const padding = 20
  const usable = Math.max(120, metrics.width - padding * 2)
  const cols = Math.max(1, Math.floor((usable + gap) / (minWidth + gap)))
  const cellW = Math.floor((usable - gap * (cols - 1)) / cols)
  const cellH = Math.round(cellW * heightRatio)
  const stepY = cellH + gap
  const rows = Math.ceil(items.length / cols)
  const totalH = Math.max(0, rows * stepY - gap)
  const firstRow = Math.max(0, Math.floor(metrics.scrollTop / stepY) - overscan)
  const lastRow = Math.min(rows - 1, Math.ceil((metrics.scrollTop + metrics.height) / stepY) + overscan)

  const cells: ReactElement[] = []
  if (cols > 0 && rows > 0) {
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col
        if (index >= items.length) break
        cells.push(
          <div
            key={index}
            style={{
              position: 'absolute',
              left: padding + col * (cellW + gap),
              top: row * stepY,
              width: cellW,
              height: cellH
            }}
          >
            {renderItem(items[index], index)}
          </div>
        )
      }
    }
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget
        setMetrics((m) => ({ ...m, scrollTop: el.scrollTop, height: el.clientHeight }))
        if (!onEndReached) return
        const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 600
        if (nearBottom && !endedRef.current) {
          endedRef.current = true
          onEndReached()
        } else if (!nearBottom) {
          endedRef.current = false
        }
      }}
      className={className}
      style={{ overflowY: 'auto', overflowX: 'hidden' }}
    >
      <div style={{ position: 'relative', height: totalH + padding * 2, width: '100%' }}>
        <div style={{ position: 'absolute', inset: 0, top: padding }}>{cells}</div>
      </div>
    </div>
  )
}
