/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Graphite Studio —— 冷中性灰阶，逐级 +4~5% 亮度
        base: {
          950: '#141619', // App background
          900: '#171A1D', // 画布 / 面板底色
          850: '#1B1E22', // Sidebar / 输入框
          800: '#20242A', // 抬起层
          750: '#25292E', // Card surface
          700: '#2A2F35', // hover 抬起
          650: '#30353C', // 分段控件底
          600: '#343940'  // Border
        },
        ink: {
          100: '#F3F4F6', // Primary text
          200: '#DFE3E9',
          300: '#BFC5CE',
          400: '#9CA3AF', // Secondary text
          500: '#6E7681', // Tertiary / 说明文字
          600: '#4A5158'  // 占位图形
        },
        accent: {
          DEFAULT: '#B8C6FF',
          soft: '#8E9EE8',
          dim: '#3C4666'
        },
        ok: '#8FD6A8',
        warn: '#E6C079',
        danger: '#E58580',
        info: '#93B8F0',
        line: {
          DEFAULT: 'rgba(255,255,255,0.055)',
          strong: 'rgba(255,255,255,0.12)',
          focus: 'rgba(184,198,255,0.45)'
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
        card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 2px 6px -2px rgba(0,0,0,0.6)',
        pop: '0 16px 40px -12px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
        focus: '0 0 0 1px rgba(184,198,255,0.35), 0 0 0 4px rgba(184,198,255,0.08)'
      },
      transitionTimingFunction: {
        studio: 'cubic-bezier(0.22, 0.61, 0.36, 1)'
      }
    }
  },
  plugins: []
}
