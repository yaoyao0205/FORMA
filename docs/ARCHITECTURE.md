# FORMA 架构设计

本地 3D 资产管理器。Electron + React + TypeScript + SQLite + Three.js，完全离线。

## 1. 进程模型

```
┌───────────────────────────── Main (Node) ─────────────────────────────┐
│ app 生命周期 / 单窗口 / 原生菜单                                        │
│ IPC Router（每个 channel 的入参都用 zod 风格手写校验）                    │
│ services/                                                              │
│   database.ts   SQLite 连接、WAL、迁移（schema_migrations）             │
│   libraries.ts  模型库 CRUD、目录扫描、文件监控                         │
│   models.ts     模型 CRUD、搜索/筛选/排序、标签与项目关联               │
│   imports.ts    导入队列（引用 / 托管），SHA-256 去重，进度与取消        │
│   thumbnails.ts 缩略图落盘到独立缓存目录                                │
│   settings.ts   单位、外部软件、窗口状态                                │
│ parsers/        STL / OBJ / 3MF —— 纯函数，不依赖 Electron             │
└───────────────────────────────────────────────────────────────────────┘
                    │ IPC（invoke / 事件）        ▲ contextBridge
┌───────────────────▼─────────────────────────────┴─────────────────────┐
│ Preload：只暴露 window.forma.api 白名单方法，无 node 泄漏              │
└───────────────────┬───────────────────────────────────────────────────┘
┌───────────────────▼──────────────── Renderer (React) ─────────────────┐
│ Zustand store：library / models / filters / selection / viewer         │
│ 三栏 UI：Sidebar 240 · AssetGrid · Inspector 320                       │
│ viewers/ModelViewer：R3F + 自定义 OrbitControls + Grid + Axes          │
│ 离屏缩略图渲染器：Three.js → canvas.toDataURL → IPC 落盘               │
└───────────────────────────────────────────────────────────────────────┘
```

渲染进程 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: false`（preload 需 import 共享类型）。
所有磁盘访问只发生在主进程。

## 2. 目录结构

```
FORMA/
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
├── tsconfig.{json,node.json,web.json}
├── tailwind.config.js / postcss.config.js
├── docs/ARCHITECTURE.md
├── test/                      # node --test：解析器与哈希的单元测试
├── src/
│   ├── shared/                # 主/渲染共享
│   │   ├── types.ts           # Library / ModelAsset / Tag / Project / PrintRecord
│   │   └── ipc.ts             # channel 常量 + 请求/响应类型
│   ├── main/
│   │   ├── index.ts           # BrowserWindow、菜单、生命周期
│   │   ├── ipc.ts             # 通道注册 + 参数校验 + 统一错误包装
│   │   ├── parsers/
│   │   │   ├── types.ts       # ParsedMesh / ParseResult / ParseOptions
│   │   │   ├── stl.ts         # binary + ASCII
│   │   │   ├── obj.ts         # v/vn/f，多对象分组
│   │   │   ├── threemf.ts     # fflate 解 zip + XML 资源树 + transform + 单位
│   │   │   └── index.ts       # byExtension 注册表
│   │   ├── services/
│   │   │   ├── database.ts
│   │   │   ├── libraries.ts
│   │   │   ├── models.ts
│   │   │   ├── imports.ts
│   │   │   ├── thumbnails.ts
│   │   │   └── settings.ts
│   │   └── utils/{hash.ts, fsx.ts, log.ts, validate.ts}
│   ├── preload/{index.ts, index.d.ts}
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx / App.tsx
│           ├── components/ui/           # shadcn 风格的 Button/Dialog/Input/Tooltip…
│           ├── components/              # Sidebar, AssetGrid, AssetCard, Inspector, Toolbar…
│           ├── viewers/                 # ModelViewer, ThumbnailRenderer
│           ├── store/                   # useLibraryStore, useSelectionStore, useUIStore
│           └── lib/{cn.ts, format.ts, api.ts}
└── resources/icon.png
```

## 3. 数据模型（SQLite）

| 表 | 作用 | 关键字段 |
|---|---|---|
| `libraries` | 模型库 | id, name, path, mode(reference/managed), watch, created_at |
| `models` | 资产主表 | id, library_id, path, filename, ext, size, sha256, mtime, bbox_x/y/z, unit, vertices, triangles, mesh_count, volume_mm3, closed, favorite, rating, notes, source_url, print_status, thumbnail, custom_cover, missing, parse_error, deleted_at |
| `projects` | 项目/文件夹 | id, name, color, sort_order |
| `tags` | 标签 | id, name(unique), color |
| `model_tags` | 多对多 | model_id, tag_id |
| `model_projects` | 多对多 | model_id, project_id |
| `print_records` | 打印历史（可多次） | id, model_id, status, material, color, duration_seconds, result, printed_at, notes |
| `app_settings` | 键值设置 | key, value |
| `schema_migrations` | 版本迁移 | id, applied_at |

索引：`(library_id, path)` 唯一、`sha256`、`imported_at DESC`、`ext`、`filename_lower`。
删除语义：`deleted_at` 软删除记录（可恢复）；物理文件只在用户显式选择时才移入废纸篓。二者在 IPC 层是两个独立按钮。

## 4. IPC 契约（节选）

| channel | 入参 | 返回 |
|---|---|---|
| `library:list` | – | `Library[]` |
| `library:create` | `{name, path?, mode}` | `Library` |
| `library:pickFolder` | `{title}` | `string \| null` |
| `library:scan` | `{libraryId}` | `{total}`，进度走 `library:scan-progress` 事件 |
| `models:query` | `{libraryId, search, tags, projects, exts, sort, favoritesOnly, includeDeleted, offset, limit}` | `{rows, total}` |
| `models:update` | `{id, patch}` | `ModelAsset` |
| `models:delete` | `{ids, deleteFiles}` | `{records, files}` |
| `models:restore` | `{ids}` | `{restored}` |
| `geometry:load` | `{id, maxTriangles}` | `{positions:Float32Array, indices:Uint32Array, meta} \| {error}` |
| `import:paths` | `{libraryId, paths, mode}` | `ImportResult`，进度走 `import:progress` |
| `thumbnail:save` | `{modelId, dataUrl}` | `{path}` |
| `print:add` | `{modelId, record}` | `PrintRecord` |
| `app:stats` | – | `{count, bytes, byExt}` |

所有 handler 先过 `validate.ts` 的轻量 schema 校验，失败返回 `{ok:false, error}`；渲染端统一 `unwrap()`。

## 5. 解析器抽象

```ts
interface MeshParser {
  extensions: string[]
  parse(input: ParseInput, opts: ParseOptions): Promise<ParseResult>
}
type ParseResult = {
  meshes: ParsedMesh[]        // 多对象保留分组，便于"独立网格"判断
  bounds: Bounds
  vertices: number
  triangles: number
  warnings: string[]          // 例如 "3MF 含不支持的纹理扩展"
  unitHint?: 'mm' | 'cm' | 'inch' | 'unknown'
}
```

- STL：二进制按 50 字节步进，ASCII 按 `vertex` 扫描；法线用面法线重算。
- OBJ：只取 `v / vn / f`，忽略材质库与贴图并在 warnings 里标注；支持负索引与多边形扇三角化。
- 3MF：`fflate.unzipSync` → `3D/3dmodel.model` → 解析 `object/mesh/vertices/triangles`、`components` 递归、`build/item` transform、`unit` 换算；`p:path` 引用的子模型也会加载。不支持的材质/纹理/beam-lattice 进 warnings。

STL 无单位信息：`unitHint` 保持 `unknown`，库内默认 mm 但 UI 明确标"单位未声明，可在信息面板修改"。

## 6. 缩略图链路

主进程 `geometry:load`（预算 30 万三角面）→ 渲染进程 `ThumbnailRenderer` 用 Three.js 离屏 canvas 512×512、三点布光、等轴视角 → `toDataURL('image/png')` → `thumbnail:save` 写入 `userData/thumbnails/<sha256>.png` → DB 记路径。
队列串行（同一时刻 1 张），避免大批量导入时爆内存；失败只记录 `parse_error`，不影响其余任务。

## 7. 开发计划与验收

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 | 骨架、配置、类型、DB 迁移 | `npm run typecheck` 通过；DB 文件生成 8 张表 |
| P1 | 库/导入/扫描/去重/缩略图/网格/预览/信息/标签/搜索 | STL+OBJ+3MF 可导入并出真缩略图；重启后数据仍在 |
| P2 | 多库、文件夹监控、批量导入取消、缺失检测 | 删除磁盘文件后卡片转为"缺失"态 |
| P3 | Bambu Studio 打开、打印记录、耗材、项目 | 打印记录可增删查，状态落到卡片 |
| P4 | 性能（虚拟列表）、打包、迁移、备份 | 1 万条种子数据滚动流畅；`electron-builder --dir` 出 .app |

第一轮交付覆盖 P0–P1，并把 P2/P3 的表结构与 IPC 一并铺好。
