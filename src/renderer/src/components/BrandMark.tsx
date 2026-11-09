import type { ReactElement } from 'react'

/**
 * 应用内品牌标 —— 应用图标（石墨丝网复古）的矢量简化版。
 *
 * 应用图标是 1024 位图，缩小到 20px 时半调网点、双线环与刻位都会糊掉，
 * 所以这里按「符号级」重绘：等轴立方体三面 + 单线金环，颜色与应用图标同值。
 *
 * 颜色写死为品牌色而非主题变量：品牌标不随深浅主题变色，
 * 与 Dock 图标保持同一个身份（浅色主题下同样成立）。
 */
export function BrandMark({ size = 20 }: { size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="FORMA"
      className="shrink-0"
      shapeRendering="geometricPrecision"
    >
      {/* 石墨底：比侧栏的 base-850 再暗一档，深色下也保留徽章轮廓 */}
      <rect x="0" y="0" width="24" height="24" rx="5.4" fill="#0E1013" />
      {/* 金环：对应图标的双线环，20px 下只留一条 */}
      <circle cx="12" cy="12" r="9.3" fill="none" stroke="#E6C079" strokeWidth="0.9" />
      {/* 等轴立方体：顶面 / 左侧靛蓝 / 右侧墨蓝 */}
      <polygon points="12,4.5 19,8 12,11.5 5,8" fill="#C7D2FF" />
      <polygon points="5,8 12,11.5 12,18.5 5,15" fill="#5A6BD8" />
      <polygon points="12,11.5 19,8 19,15 12,18.5" fill="#333C66" />
    </svg>
  )
}
