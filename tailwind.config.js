/** @type {import('tailwindcss').Config} */
// 颜色全部走 CSS 变量（RGB 三元组），这样同一套组件代码可以在深/浅两套主题下工作，
// 不需要给每个 class 加 dark: 前缀，也不会出现两套样式逐渐分叉。
const v = (name) => `rgb(var(${name}) / <alpha-value>)`

module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Graphite Studio —— 冷中性灰阶
        base: {
          950: v('--c-base-950'), // App background
          900: v('--c-base-900'), // 画布 / 面板底色
          850: v('--c-base-850'), // Sidebar / 输入框
          800: v('--c-base-800'), // 抬起层
          750: v('--c-base-750'), // Card surface
          700: v('--c-base-700'), // hover 抬起
          650: v('--c-base-650'), // 分段控件底
          600: v('--c-base-600') // Border
        },
        ink: {
          100: v('--c-ink-100'), // Primary text
          200: v('--c-ink-200'),
          300: v('--c-ink-300'),
          400: v('--c-ink-400'), // Secondary text
          500: v('--c-ink-500'), // Tertiary / 说明文字
          600: v('--c-ink-600') // 占位图形
        },
        /** 覆盖层基色：深色主题是白，浅色主题是深墨，配合原有 alpha 使用 */
        overlay: v('--c-overlay'),
        /** 格式标识色：深色主题偏亮，浅色主题压深保证对比 */
        ext: {
          stl: v('--c-ext-stl'),
          obj: v('--c-ext-obj'),
          mf: v('--c-ext-3mf')
        },
        accent: {
          DEFAULT: v('--c-accent'),
          soft: v('--c-accent-soft'),
          dim: v('--c-accent-dim')
        },
        ok: v('--c-ok'),
        warn: v('--c-warn'),
        danger: v('--c-danger'),
        info: v('--c-info'),
        line: {
          DEFAULT: 'rgb(var(--c-line) / var(--a-line))',
          strong: 'rgb(var(--c-line) / var(--a-line-strong))',
          focus: 'rgb(var(--c-accent) / 0.45)'
        }
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display',
          'Segoe UI Variable Text', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei',
          'Helvetica Neue', 'Arial', 'sans-serif'
        ],
        mono: ['SF Mono', 'ui-monospace', 'Menlo', 'Cascadia Mono', 'monospace']
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '15px' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '22px' }],
        xl: ['20px', { lineHeight: '26px' }]
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        7: '28px',
        56: '56px'
      },
      borderRadius: {
        card: '8px',
        panel: '10px'
      },
      boxShadow: {
        card: '0 1px 0 var(--c-card-inset) inset, 0 2px 6px -2px var(--c-card-shadow)',
        pop: '0 16px 40px -12px var(--c-pop-shadow), 0 0 0 1px var(--c-pop-ring)',
        focus: '0 0 0 1px rgb(var(--c-accent) / 0.5), 0 0 0 4px rgb(var(--c-accent) / 0.14)'
      },
      transitionTimingFunction: {
        studio: 'cubic-bezier(0.22, 0.61, 0.36, 1)'
      }
    }
  },
  plugins: []
}
