# 文件夹监控（Phase 2）

外部文件夹里的模型变化会自动进入 FORMA 的库，不需要手动「重扫」。

## 怎么用

侧栏顶部库切换器 → 选中库 → 「文件夹监控：已开启 / 已关闭」。
默认新建库就是开启状态；关闭后该库不再监听，也不再有轮询开销。

## 实现（`src/main/services/watcher.ts`）

两条通道，一个入口：

1. **`fs.watch`（recursive，实时通道）**
   拿到事件后 debounce 2 秒再导入，避免读到写了一半的文件。
2. **定时轮询快照（可靠通道）**
   每 8 秒递归读一次目录，比对各文件的 `mtimeMs`。新增或修改就进队列。
   启动时先建一次基线快照，所以库里已存在的文件不会被重复导入。

两条通道最终都调用 `ImportService.importPaths(libraryId, [file])`，因此：

- SHA-256 去重、托管库同名不覆盖、缩略图按内容哈希失效，全部沿用既有逻辑
- 导入完成后会发 `done` 进度事件，渲染进程据此自动刷新网格，无需用户操作

## 删除与改名：自动同步「文件丢失」

监控不只处理新增，文件被移走或改名也会自己收敛，不需要手动重扫。

- 轮询比对旧快照与新快照：**旧有新无** → 把对应记录标成 `missing`（只打标记，不删库记录、不删文件）
- **新有旧无** → 先清掉 `missing` 再走一遍导入判定（内容没变时会被哈希判重吞掉，不产生副本）
- 每次标记变化都通过 `models:changed` 事件推给渲染进程，界面自己刷新，卡片左上出现红色「文件丢失」胶囊，侧栏计数同步

启动时用基线快照做一次校准（`reconcileMissing`），所以进程没运行期间发生的删除/恢复，下次启动也会收敛。

验证：

```
[test] removed2
watch poll: 1 removed file(s), 1 newly flagged missing
models-changed emitted
```

界面效果：侧栏「文件丢失 1」+ 卡片红色胶囊（`docs/shots/graphite-05-file-missing.png`）。文件移回后同一轮轮询清除标记，计数回到 0。

## 实测踩到的两个坑

**1. 扩展名格式不一致**
`SUPPORTED_EXTENSIONS` 里存的是不带点的 `stl`，而 `path.extname()` 返回 `.stl`。
直接比对会把所有文件过滤掉，表现为「监控日志显示启动成功，但永远 0 个文件」。
两边都 `replace(/^\./, '')` 归一化后才正常。

**2. recursive `fs.watch` 不可靠**
在这台机器上，对 `/tmp` 这类符号链接路径监听时 FSEvents 回调完全不触发；
改 `realpathSync` 之后仍然收不到。所以轮询不是备选，而是主通道，
`fs.watch` 只负责在支持的平台上把延迟从 8 秒降到 2 秒。

## 验证记录（2026-11-09）

清库 → 用 8 个模型建库 → 启动应用 → 往库目录复制一个 20×20×20mm 的新 STL：

```
[forma] watch started: /tmp/forma_seed
[test] copied8
[forma] watch poll: 1 changed file(s)
[forma] watch flush: 1 file(s)
[forma] watch poll tick: 16 file(s), changed 0   ← 快照已更新，不会重复导入
```

结果：网格从 8 个自动变成 9 个，新模型的缩略图真实渲染，DB 记录数同步 +1。
截图：`docs/shots/graphite-04-folder-watch.png`

`npm run typecheck` 0 错误；`npm run build` 通过；`npm test` 23/23。

## 已知限制

- 删除只打「文件丢失」标记，**不会自动删库记录**；清理用「文件丢失」分组 + 手动移除，物理文件永远由用户处置。
- 轮询延迟最多 8 秒；对 1 万级目录，每轮 `readdir + stat` 约几十毫秒，尚未做压测。
- 单轮最多导入 40 个文件，超出的会截断并打 warning，避免一次写入把主进程卡住。
- 监控只针对开启了 watch 的库；托管库也支持，但导入过程中的自身写盘可能触发一次多余的扫描（会被哈希判重吞掉）。
