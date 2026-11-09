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

## 已知限制

- 多标签筛选为 **AND（交集）** 语义，筛选条用 `∩` 明示；暂未提供 OR 模式
- 标签筛选尚未有单元测试覆盖
- 1 万条以上规模的虚拟滚动与分页仅按设计实现，未做压测
