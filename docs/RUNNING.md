# FORMA 运行与打包

## 环境要求

- macOS 12+（开发机验证于 macOS 15.6.1 / arm64）
- Node.js 20 以上（验证于 v22.23.2），npm 10+
- 无需 Xcode，`better-sqlite3` 使用预编译二进制

## 首次安装

```bash
cd FORMA
npm install --no-audit --no-fund
```

如果 Electron 或打包依赖下载缓慢，可先设置镜像：

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

## 开发模式

```bash
npm run dev            # 启动带热更新的开发窗口
npm run typecheck      # 主进程 + 渲染进程两套 tsconfig 的类型检查
npm test               # 编译解析器模块后运行单元测试
```

## 构建与运行产物

```bash
npm run build          # 产物在 out/（main、preload、renderer）
npx electron out/main/index.js
```

## 打包 macOS 应用

```bash
npm run dist:dir       # 只打包 .app（最快，便于本地验证）
npm run dist:mac       # 额外生成 dmg（需要签名证书，否则产物为未签名）
```

产物位于 `release/mac-arm64/FORMA.app`，可直接双击运行。
未签名应用首次打开需要在「系统设置 → 隐私与安全性」中允许，或执行：

```bash
xattr -dr com.apple.quarantine release/mac-arm64/FORMA.app
```

## 数据位置

| 内容 | 路径 |
| --- | --- |
| 数据库 | `~/Library/Application Support/FORMA/forma.db` |
| 缩略图缓存 | `~/Library/Application Support/FORMA/thumbnails/` |
| 托管库文件 | `~/Library/Application Support/FORMA/libraries/<库 ID>/` |

重置全部本地数据（会删除所有库记录与缓存）：

```bash
rm -rf "$HOME/Library/Application Support/FORMA"
```

## 自动化验收钩子（开发用）

应用支持三个环境变量，用于无界面截图验证：

```bash
FORMA_SEED_DIR=/path/to/models \      # 无库时自动建「示例模型库」并导入该目录
FORMA_SHOT=/tmp/shot.png \            # did-finish-load 后截图并退出
FORMA_SHOT_CLICK_CARD=0 \             # 截图前点击第 N 个模型卡片
FORMA_SHOT_DELAY=11000 \              # 截图延迟（毫秒，默认 6000）
npx electron out/main/index.js
```

## 支持的格式

| 格式 | 解析内容 | 明确不支持 |
| --- | --- | --- |
| STL | binary / ASCII，面法线重算 | 无颜色、无单位信息 |
| OBJ | `v` / `vn` / `f`、负索引、多边形三角化、`o`/`g` 多对象 | 材质库（`.mtl` 仅提示）、UV 贴图 |
| 3MF | ZIP 容器、`resources` 对象、`components` 嵌套、`build/item` 变换、`unit` 换算、`p:path` 外部子模型 | 纹理贴图、多模型资源、切片扩展 |

遇到不支持的内容时，界面会在右栏显示黄色提示条，不会静默丢弃，也不会声称"完整支持"。
