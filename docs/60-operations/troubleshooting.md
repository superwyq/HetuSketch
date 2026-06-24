# 常见问题排查

## better-sqlite3 错误

现象：启动或测试时报原生模块 ABI 错误。

处理：

```powershell
npm run eb:rebuild
```

或重新安装依赖。

## FTS 搜索无结果

- 确认条目文件存在且格式可解析。
- 执行索引重建：`window.hetuSketch.index.rebuild(projectId)`。
- 检查 `hetusketch-index.sqlite` 是否可写。

## 剧情画布打不开

- 确认当前已选择作品，并且从写作工作台章节入口进入，URL 包含 `?chapter=<chapterId>`。
- 首次打开时 `open(bookId, chapterId)` 失败是正常路径，渲染端会继续调用 `create`。
- 检查 `books/<bookId>/plotboards/<chapterId>.plotboard.json` 是否可写；若 JSON 损坏，可先备份后删除并重新创建。

## 剧情画布保存失败或保存后搜索不到

- 保存失败时不要刷新页面，先复制或导出当前卡片内容，再重试保存。
- 检查书目目录权限和磁盘空间。
- 保存成功但索引不同步时，执行：`window.hetuSketch.plotboards.syncIndex(bookId)`。
- 若仍异常，执行全局索引重建：`window.hetuSketch.index.rebuild(projectId)`。

## AI 连接失败

- 确认 LLM / Embedding 已启用。
- 检查 Base URL、模型名、API Key。
- 注意错误信息不会回显密钥。

## 剧情画布生成正文为“本地降级生成”

- 这是 LLM 未配置或调用失败时的预期降级行为，`PlotboardGenerationResult.status` 为 `degraded`。
- 检查设置页 AI 配置，确保 LLM enabled 且 `apiKeySet` 为 true。
- 如果外部服务超时，缩小生成范围为单卡或选区，降低目标字数后重试。

## State Diff 没有写入状态快照

- 只有状态为 `accepted` 或 `modified` 的 Diff 会写入快照；`suggested` 和 `rejected` 不写入。
- 确认点击了“写入已确认 Diff 到章节快照”。
- 检查 `books/<bookId>/states/<chapterId>.state-snapshot.json`。

## 校验结果无法定位正文段落

- 画布校验会优先匹配 `sourceCardId=<cardId>` 或 `data-card-id="<cardId>"`，其次匹配卡片标题和事实片段。
- 如果用户手写正文与卡片事实差异过大，可能只能定位到剧情卡。
- 可在生成正文或手动正文中保留卡片标题，提升定位成功率。

## RAG 无结果或状态 dirty

- 确认 Embedding 配置可用。
- 重新执行 `rag.build(projectId)`。
- 如果未配置 Embedding，会降级为 FTS。

## 构建失败

按顺序定位：

```powershell
npm run typecheck
npm run lint
npm run test
```

先修复类型或 lint 错误，再运行 build。