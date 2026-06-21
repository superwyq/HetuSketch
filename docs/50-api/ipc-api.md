# IPC API 清单

代码权威来源：`src/shared/ipc.ts` 与 `src/preload/index.ts`。

## API 命名空间

| 命名空间 | 方法 |
| --- | --- |
| `app` | `getInfo`, `ping` |
| `search` | `preview`, `global`, `recent` |
| `dashboard` | `stats` |
| `settingSets` | `list`, `get`, `create`, `update`, `delete` |
| `books` | `list`, `get`, `create`, `update`, `delete`, `bindSettingSet` |
| `chapters` | `listTree`, `createVolume`, `updateVolume`, `createChapter`, `updateChapter`, `moveChapter`, `deleteChapter` |
| `projects` | `list`, `get`, `create`, `update`, `delete`, `export`, `importFolder`, `importZip` |
| `entries` | `list`, `get`, `create`, `update`, `delete` |
| `validation` | `basic`, `enhanced` |
| `ai` | `getConfig`, `saveConfig`, `testConnection`, `getPrompts`, `savePrompts`, `listSkills`, `saveSkills`, `listHttpTools`, `saveHttpTool`, `deleteHttpTool`, `completeSetting`, `foreshadowing`, `listModels`, `streamValidation`, `streamRagAnswer`, `streamCompleteSetting`, `streamForeshadowing` |
| `agent` | `list`, `get`, `create`, `update`, `delete`, `reorder` |
| `rag` | `build`, `state`, `query`, `answer` |
| `index` | `rebuild` |
| `system` | `fonts` |
| `desktop` | `toggleFloating`, `showFloating`, `hideFloating`, `setFloatingPinned`, `setMainPinned`, `minimize`, `maximize`, `close`, `openWindow` |

## 示例

```ts
const projects = await window.hetuSketch.projects.list();
const result = await window.hetuSketch.validation.basic({
  projectId,
  text,
  includePlotReminders: true
});
```

## 参数约束

- 搜索预览关键词裁剪到 80 字符。
- 校验文本裁剪到 50,000 字符。
- RAG 查询文本裁剪到 10,000 字符。
- 列表 limit 限制在合理范围内。
- HTTP 工具 URL 只允许 HTTP/HTTPS。
- ID 字符串会裁剪并通过服务层安全片段校验。

## 错误与降级

- 参数非法时 Promise reject。
- AI/RAG 未配置时返回 degraded 或 warnings。
- 导入导出取消时返回 `undefined`。
