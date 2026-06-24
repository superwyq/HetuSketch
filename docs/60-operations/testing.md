# 测试策略

## 自动化命令

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

如遇 `better-sqlite3` 原生模块 ABI 问题，先运行：

```powershell
npm run eb:rebuild
# 或
npm run test:native
```

## 测试范围

| 文件 | 覆盖内容 |
| --- | --- |
| `src/main/services/storageService.test.ts` | 作品、条目、搜索、导入导出、AI 降级、RAG、HTTP 工具、剧情画布创建/保存/索引/快照/正文写入等主服务行为。 |
| `src/main/services/plotboardService.test.ts` | 剧情画布 AI 上下文组装、未配置 AI 的降级生成、State Diff 结算、Markdown 大纲导出、时间线/状态/红线/世界规则/伏笔/章节衔接校验。 |
| `src/main/services/entrySerialization.test.ts` | JSON/Markdown 条目序列化、解析和可搜索文本提取。 |
| `src/main/services/storagePaths.test.ts` | 路径计算和路径安全。 |
| `src/renderer/src/App.test.tsx` | React 应用壳基础渲染。 |

## 剧情画布自动化覆盖重点

| 能力 | 断言要点 |
| --- | --- |
| 画布创建与保存 | 首次创建空画布；保存后 `*.plotboard.json` 存在；未知字段保留；默认状态模板合并。 |
| 派生索引 | 保存画布/状态快照后 `syncPlotboardIndex(bookId)` 无错误；索引可从事实源重建。 |
| AI 上下文 | 选卡、连线、角色、世界规则、线索、章节快照、场景增量和邻近摘要均进入 `PlotboardAiContext`。 |
| 降级生成 | LLM 未配置时返回 `status: degraded`，生成 Markdown，重写模式保留旧正文过期标记。 |
| 正文写入 | `writeGeneratedMarkdown` 默认生成正文快照，并将章节状态置为 `drafting`。 |
| State Diff | 只有 `accepted` / `modified` Diff 写入状态快照，`rejected` 只进入返回统计。 |
| 校验 | 时间线冲突、死亡后出场、行为红线、世界规则、伏笔回收早于埋设、重复回收、章节衔接均有 finding。 |
| 导出 | Markdown 大纲包含卡片、POV、状态增量和连线；渲染端 SVG 导出需手动冒烟。 |

## 手动冒烟路径

1. 启动应用，确认主窗口显示工作台。
2. 创建作品并设为当前作品。
3. 创建角色、世界观、伏笔条目。
4. 搜索角色或规则关键词。
5. 在写作页创建章节并编辑 Markdown。
6. 从章节进入“剧情画布”；首次打开应自动创建空画布。
7. 双击空白处创建剧情卡，编辑标题、事实、类型、timecode、地点、POV。
8. 从素材库拖入角色、世界观、线索、章节和模板，确认只保存引用 ID。
9. 从卡片锚点拖到另一张卡，创建并编辑 sequence/causal/parallel/flashback/conditional 连线。
10. 拖拽卡片、滚轮缩放、拖拽空白处平移、Shift 框选、Ctrl+S 保存、Ctrl+Z/Y 撤销重做。
11. 插入三幕式、推理揭示链、群像交叉线模板。
12. 添加状态增量，选择单卡/选区/全章/续写/重写生成；未配置 LLM 时应降级生成并显示 warning。
13. 确认/修改/拒绝 State Diff，写入章节状态快照。
14. 运行逻辑校验，点击 finding 应回跳剧情卡；有正文时显示 Markdown 段落定位。
15. 线索回收后点击“更新为 resolved”，确认伏笔条目状态更新。
16. 导出 Markdown 大纲和 SVG 图片。
17. 返回章节，确认生成正文已写入且旧正文快照存在。
18. 在设置中保存 AI 配置，确认不回显明文 Key。
19. 导出作品 ZIP，再导入验证。

## 调试建议

- 画布文件：检查 `books/<bookId>/plotboards/<chapterId>.plotboard.json`。
- 状态快照：检查 `books/<bookId>/states/<chapterId>.state-snapshot.json`。
- 正文快照：检查 `books/<bookId>/snapshots/`。
- 索引问题：运行 `window.hetuSketch.plotboards.syncIndex(bookId)` 或全局 `window.hetuSketch.index.rebuild(projectId)`。
- AI 生成问题：先确认 `window.hetuSketch.ai.getConfig()` 返回 `apiKeySet: true` 且 LLM enabled；未配置时预期为降级生成。
- 校验定位问题：确认生成 Markdown 中包含卡片标题、事实片段或显式 `sourceCardId=<cardId>` / `data-card-id="<cardId>"`。