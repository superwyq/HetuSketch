# IPC API 清单

代码权威来源：`src/shared/ipc.ts`、`src/preload/index.ts` 与各 `src/main/ipc/*.ts` 注册文件。

## API 命名空间

| 命名空间 | 方法 |
| --- | --- |
| `app` | `getInfo`, `ping` |
| `search` | `preview`, `global`, `recent` |
| `dashboard` | `stats` |
| `settingSets` | `list`, `get`, `create`, `update`, `delete` |
| `books` | `list`, `get`, `create`, `update`, `delete`, `bindSettingSet` |
| `chapters` | `listTree`, `createVolume`, `updateVolume`, `createChapter`, `updateChapter`, `moveChapter`, `deleteChapter`, `deleteVolume`, `selectExportFolder`, `export` |
| `plotboards` | `create`, `open`, `save`, `saveSnapshot`, `loadSnapshot`, `syncIndex`, `exportOutline`, `saveChapterSnapshot`, `writeGeneratedMarkdown`, `buildAiContext`, `generate`, `streamGenerate`, `settleDiffs`, `validate` |
| `projects` | `list`, `get`, `create`, `update`, `delete`, `export`, `importFolder`, `importZip` |
| `entries` | `list`, `get`, `create`, `update`, `delete` |
| `inspirationTypes` | `list`, `create`, `update`, `delete` |
| `validation` | `basic`, `enhanced` |
| `ai` | `getConfig`, `saveConfig`, `testConnection`, `getPrompts`, `savePrompts`, `listSkills`, `saveSkills`, `listHttpTools`, `saveHttpTool`, `deleteHttpTool`, `completeSetting`, `foreshadowing`, `listModels`, `streamValidation`, `streamRagAnswer`, `streamCompleteSetting`, `streamForeshadowing` |
| `agent` | `list`, `get`, `create`, `update`, `delete`, `reorder` |
| `rag` | `build`, `state`, `query`, `answer` |
| `index` | `rebuild` |
| `system` | `fonts` |
| `desktop` | `toggleFloating`, `showFloating`, `hideFloating`, `setFloatingPinned`, `setMainPinned`, `minimize`, `maximize`, `close`, `openWindow` |

## 剧情画布 IPC 契约

| preload 方法 | IPC 通道 | 参数 | 返回 |
| --- | --- | --- | --- |
| `plotboards.create(input)` | `plotboards:create` | `{ bookId: string; chapterId: string; projectId?: string; settingSetId?: string }` | `Promise<Plotboard>` |
| `plotboards.open(bookId, chapterId)` | `plotboards:open` | `bookId: string`, `chapterId: string` | `Promise<Plotboard>` |
| `plotboards.save(plotboard)` | `plotboards:save` | `Plotboard` | `Promise<Plotboard>` |
| `plotboards.saveSnapshot(bookId, snapshot)` | `plotboards:snapshot:save` | `bookId: string`, `StateSnapshot` | `Promise<StateSnapshot>` |
| `plotboards.loadSnapshot(bookId, chapterId)` | `plotboards:snapshot:load` | `bookId: string`, `chapterId: string` | `Promise<StateSnapshot>` |
| `plotboards.syncIndex(bookId)` | `plotboards:index:sync` | `bookId: string` | `Promise<IndexSyncSummary>` |
| `plotboards.exportOutline(bookId, chapterId)` | `plotboards:outline:export` | `bookId: string`, `chapterId: string` | `Promise<string>` |
| `plotboards.saveChapterSnapshot(bookId, chapterId)` | `plotboards:chapter-snapshot:save` | `bookId: string`, `chapterId: string` | `Promise<ChapterBodySnapshotResult>` |
| `plotboards.writeGeneratedMarkdown(input)` | `plotboards:generated-markdown:write` | `GeneratedMarkdownWriteInput` | `Promise<GeneratedMarkdownWriteResult>` |
| `plotboards.buildAiContext(request)` | `plotboards:ai-context:build` | `PlotboardGenerationRequest` | `Promise<PlotboardAiContext>` |
| `plotboards.generate(request)` | `plotboards:generate` | `PlotboardGenerationRequest` | `Promise<PlotboardGenerationResult>` |
| `plotboards.streamGenerate(request, onChunk)` | `plotboards:generate:stream` | `PlotboardGenerationRequest`, `(chunk: AiStreamChunk) => void` | `Promise<PlotboardGenerationResult>` |
| `plotboards.settleDiffs(input)` | `plotboards:diffs:settle` | `StateDiffSettlementInput` | `Promise<StateDiffSettlementResult>` |
| `plotboards.validate(input)` | `plotboards:validate` | `PlotboardValidationRequest` | `Promise<PlotboardValidationResult>` |

### 流式剧情生成临时通道

`streamGenerate` 使用 `ipcRenderer.send('plotboards:generate:stream', requestWithRequestId)` 发起，并监听：

```text
plotboards:generate:stream:chunk:<requestId>
plotboards:generate:stream:end:<requestId>
plotboards:generate:stream:error:<requestId>
```

`end` 事件携带最终 `PlotboardGenerationResult`；`error` 事件携带错误字符串。preload 在完成或失败后移除监听器。

## 示例

```ts
const board = await window.hetuSketch.plotboards.create({ bookId, chapterId, projectId });
await window.hetuSketch.plotboards.save({ ...board, cards: [...board.cards, card] });
const result = await window.hetuSketch.plotboards.generate({
  bookId,
  chapterId,
  settings: { mode: 'full_chapter' }
});
```

## 参数约束

- 搜索预览关键词裁剪到 80 字符。
- 校验文本裁剪到 50,000 字符；RAG 查询文本裁剪到 10,000 字符。
- 列表 limit 限制在合理范围内。
- HTTP 工具 URL 只允许 HTTP/HTTPS。
- ID 字符串会裁剪并通过服务层安全片段校验。
- 剧情画布文件路径不接受渲染端传入路径，均由主进程根据 `bookId`、`chapterId` 计算。
- AI 配置不回传明文 API Key；剧情画布生成上下文只包含当前生成所需的设定片段。

## 错误与降级

- 参数非法时 Promise reject。
- AI/RAG 未配置时返回 `degraded` 或 warnings。
- 导入导出取消时返回 `undefined`。
- 剧情画布 LLM 不可用时 `generate` / `streamGenerate` 返回 `status: 'degraded'` 并使用本地编译正文。
- 剧情画布保存失败时渲染端应保留内存草稿，不清空当前画布。