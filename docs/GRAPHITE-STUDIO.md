# Graphite Studio — UI/UX 重构说明

FORMA 在 Phase 1 功能基础上的视觉与交互重构，不改业务逻辑、不碰原始模型文件、不引入假数据。

## 设计令牌

| 用途 | 变量 | 值 |
| --- | --- | --- |
| App 背景 | `base-950` | `#141619` |
| 画布 | `base-900` | `#171A1D` |
| 侧栏 / 检查器 | `base-850` | `#1B1E22` |
| 卡片表面 | `base-750` | `#25292E` |
| 描边 | `base-600` | `#343940` |
| 强调色 | `accent` | `#B8C6FF` |
| 主文字 | `ink-100` | `#F3F4F6` |
| 次文字 | `ink-400` | `#9CA3AF` |

字号 11 / 12 / 13 / 14 / 16 / 20，间距全部落在 4px 网格；字体栈 macOS 走 SF Pro、Windows 走 Segoe UI；数字统一 `tabular-nums`。

上表写的是深色主题的实际色值。所有颜色都通过 CSS 变量（`rgb(var(--c-*) / <alpha-value>)`）注入 Tailwind，组件里不出现硬编码色值，也不使用 `dark:` 前缀——浅色主题只覆盖变量，两套主题共用同一份组件代码。

## 浅色主题

| 用途 | 变量 | 深色 | 浅色 |
| --- | --- | --- | --- |
| App 背景 | `base-950` | `#141619` | `#F3F5F8` |
| 画布 | `base-900` | `#171A1D` | `#ECEFF4` |
| 侧栏 / 检查器 | `base-850` | `#1B1E22` | `#FFFFFF` |
| 卡片表面 | `base-750` | `#25292E` | `#FFFFFF` |
| 描边 | `base-600` | `#343940` | `#DCE0E6` |
| 强调色 | `accent` | `#B8C6FF` | `#4054C8` |
| 主文字 | `ink-100` | `#F3F4F6` | `#16181B` |
| 次文字 | `ink-400` | `#9CA3AF` | `#6B7280` |
| 覆盖层基色 | `overlay` | `255 255 255` | `15 23 42` |

浅色不是把深色调亮，而是几处必须重新取值的地方：

- **强调色压深到 `#4054C8`**。强调色同时用作主按钮底色与选中描边，浅底上必须足够深，按钮上的近白文字才读得出来。
- **覆盖层换基色**。原来 67 处 `bg-white/[0.06]` 之类的白色罩，在浅底上等于不存在，统一换成 `overlay/[0.06]`：深色主题仍是白罩，浅色主题自动变成深墨罩，alpha 一个都没改。
- **画布比卡片暗一档**（`#ECEFF4` vs `#FFFFFF`）。最初让画布接近纯白，卡片边界几乎消失，白卡浮不起来；压深一档后层次恢复正常。
- **格式色另开一套**（`ext-stl/obj/mf`），深色偏亮、浅色压深，保证 11px 的 `STL` / `3MF` 徽标在两种底色上都能读。
- **缩略图舞台与 3D 视口两套主题都保持石墨深底**（`--studio-viewport-bg: #141619`）。缩略图是真实渲染出的深底 PNG，浅色外壳里保留深色舞台，白模对比稳定，也避免出现"白卡里糊一块黑"的突兀感。

### 切换与持久化

| 入口 | 行为 |
| --- | --- |
| 侧栏底部图标按钮 | 深色 → 浅色 → 跟随系统 循环，tooltip 显示当前值 |
| ⌘⇧L | 同上（三态循环） |
| `app_settings` 表 `theme` 键 | 值域 `dark` / `light` / `system`，重启后沿用 |

`system` 模式订阅 `prefers-color-scheme` 的 change 事件，系统换外观时应用即时跟随，不需要重启。实现上 `<html data-theme="light|dark">` + `style.colorScheme` 同步，颜色令牌由 `index.css` 的 `:root, [data-theme='dark']` 与 `[data-theme='light']` 两组变量提供。

### 实机验证

| 步骤 | 结果 |
| --- | --- |
| 全新库启动、`theme` 默认 `dark` | 深色外观与此前一致，无回归（`docs/shots/graphite-03` 同款布局） |
| ⌘⇧L 一次 | 界面转浅色，侧栏底部图标切为太阳；`app_settings` 写入 `theme=light` |
| 重启应用 | 直接以浅色启动（持久化生效） |
| 浅色下点选卡片 | 选中描边、勾选徽标、320px 检查器、300px 3D 预览均正常（`docs/shots/graphite-08-light-inspector.png`） |
| 浅色网格 | `docs/shots/graphite-07-light-grid.png` |

期间抓到的一个真 bug：`window.forma.settings.set({ theme })` 返回的 `settings.theme` 仍是 `dark`。原因是主进程 `ipc.ts` 的 `settings:set` 处理器用显式字段白名单构造 patch，`theme` 不在白名单里被静默丢弃——写入无声失败，界面自然不动。补上 `oneOf(o.theme, ['dark','light','system'])` 分支后恢复正常，快捷键与侧栏按钮共用这条链路，一并修好。

## 布局尺寸

- Sidebar：展开 224px，折叠 56px（`transition-[width] 200ms`）
- Toolbar：56px
- Inspector：320px，按需展开；3D 预览高 300px
- 网格：卡片最小宽 200px、间距 12px、单元高宽比 1.32
- 紧凑列表：最小宽 360px、行高 60px
- 响应式阈值：940（侧栏）、1120（检查器），只在跨阈值时自动收展

## 快捷键

| 键 | 行为 |
| --- | --- |
| ⌘B | 收起 / 展开侧栏 |
| ⌘I | 收起 / 展开检查器 |
| ⌘F | 聚焦搜索框 |
| ⌘A | 全选当前可见模型 |
| ⌘⌫ | 从库中移除选中项（不删原始文件） |
| Esc | 取消选择 |
| ⌘⇧L | 切换外观：深色 → 浅色 → 跟随系统 |

## 交互状态

- 选中：卡片描边 `accent/55` + 阴影 + 左上勾选徽标；列表模式为左侧 2px 竖条
- 悬停：边框提亮、缩略图 1.035 微缩放、收藏星浮现
- 空态：无库 / 库为空 / 搜索无结果 / 重复项各有独立文案与入口
- 文件丢失：左上角红色胶囊 + 列表内「丢失」标签
- 解析失败：卡片内提示 + 检查器 warnings 条
- 无缩略图：统一线框立方体占位（不联网、不用占位图）

## 验收记录（2026-11-09）

- `npm run typecheck`：0 错误（node + web）
- `npm run build`：main / preload / renderer 全部产出
- `npm test`：23 / 23 通过
- 实机截图（`docs/shots/graphite-*.png`）：网格、选中态 + 检查器、折叠侧栏 + 紧凑列表

### 自动化验收钩子

仅用于开发期截图，不参与生产逻辑：

```bash
FORMA_SEED_DIR=/tmp/forma_seed \
FORMA_SHOT=/tmp/shot.png \
FORMA_SHOT_DELAY=9000 \
FORMA_SHOT_CLICK_CARD=1 \
FORMA_SHOT_SCRIPT="<任意 JS>" \
npx electron out/main/index.js
```

`FORMA_SHOT_SCRIPT` 会在截图前注入，用来切到指定 UI 状态；注入后主进程会 `show/focus/invalidate` 再 `capturePage`，否则可能截到旧合成帧。

## 应用图标

图形取自应用内「无缩略图」时的等轴立方体占位符，做成 1980 年代技术插画徽章：双线金环 + 12 处刻位、粗黑轮廓的平板色块（丝网印刷）、半调网点、套色微偏移。复古感来自这四件可观察的工艺特征，而不是加一层滤镜。

| 角色 | 值 | 位置 |
| --- | --- | --- |
| 石墨底 | `#141619` | 满版，与 App 背景同值 |
| 冷蓝紫 | `#C7D2FF` | 立方体顶面、网点，与 3D 预览主材质同值 |
| 靛蓝 | `#5A6BD8` | 立方体侧面 |
| 墨蓝 | `#333C66` | 立方体暗面 |
| 暖金 | `#E6C079` | 双线环与刻位，面积最小 |

接入路径跟 `buildResources` 走 —— 图标放 `resources/`，不是 `build/`：

```
resources/icon.icns   3344086 B，11 个尺寸块（16–1024 及 @2x）
resources/icon.ico    189018 B，16/24/32/48/64/128/256
resources/icon.png    512×512，仅服务未打包运行时的窗口 / Dock 图标
```

`electron-builder.yml` 里 `mac.icon: icon.icns`、`win.icon: icon.ico` 显式声明（路径相对 `buildResources`）；主进程 `devIcon()` 只在 `app.isPackaged` 为假时把 `resources/icon.png` 交给 `BrowserWindow({ icon })` 与 `app.dock.setIcon`，打包后由 app bundle 接管。

**验证（macOS 实机）**

| 项 | 结果 |
| --- | --- |
| `iconutil -c iconset` 反向解析 icns | 成功，解出 11 个 png（含 48×48） |
| 打包产物 `Contents/Resources/icon.icns` md5 | `fc6e66c77b89a049c1f74474085a09f1`，与源文件一致 |
| `Info.plist` `CFBundleIconFile` | `icon.icns` |
| `typecheck` / `build` / `npm test` | 通过 / 通过 / 23 条全过 |
| 开发态启动截图 | 正常出图，无图标相关报错 |

**后处理**（生成图不是满版，必须修三步）：按亮度阈值找到图标真实边界并裁切 → 缩到 1024 并套 macOS 标准圆角（22.37%）→ 最外 12px 向石墨色渐变压掉原图自带的亮描边。跳过第三步，128px 下会出现肉眼可见的白框。

**应用内品牌标** `components/BrandMark.tsx` 是这枚图标的矢量简化版：20px 下网点、双线环与刻位都会糊掉，所以只留等轴立方体三面 + 单线金环，底色比侧栏再暗一档（`#0E1013`）以保住徽章轮廓。颜色写死为品牌色、不随深浅主题切换 —— 品牌标不跟着主题变色，才能和 Dock 图标是同一个身份。

## 已知限制

- 多标签筛选为 **AND（交集）** 语义，筛选条用 `∩` 明示；暂未提供 OR 模式
- 标签筛选尚未有单元测试覆盖
- 1 万条以上规模的虚拟滚动与分页仅按设计实现，未做压测
